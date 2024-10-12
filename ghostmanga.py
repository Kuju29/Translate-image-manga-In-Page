import threading, queue, shelve, requests, base64, os, logging, time, shutil
from selenium.webdriver.common.by import By
from collections import defaultdict
from datetime import datetime
from seleniumbase import SB


logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


translation_tasks = queue.Queue()
translation_results = queue.Queue()


downloaded_files_dir = 'downloaded_files'
backups_dir = os.path.join(downloaded_files_dir, 'backups')
shelve_filename = 'translated_images.db'
shelve_path = os.path.join(downloaded_files_dir, shelve_filename)


os.makedirs(backups_dir, exist_ok=True)
os.makedirs(downloaded_files_dir, exist_ok=True)


lock = threading.Lock()


def load_url_file_map():
    """Load the url_file_map from the shelve database."""
    if not os.path.exists(shelve_path + '.db'):

        with shelve.open(shelve_path) as db:
            db['url_file_map'] = {}
    with shelve.open(shelve_path) as db:
        return defaultdict(set, db.get('url_file_map', {}))


def save_url_file_map(url_file_map):
    """Save the url_file_map to the shelve database."""
    with shelve.open(shelve_path) as db:
        db['url_file_map'] = {key: list(value)
                              for key, value in url_file_map.items()}


def backup_shelve_db():
    """Create a backup copy of the shelve database."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f'translated_images_backup_{timestamp}.db'
    backup_path = os.path.join(backups_dir, backup_filename)
    try:

        base, ext = os.path.splitext(shelve_path)
        for file in os.listdir(downloaded_files_dir):
            if file.startswith(os.path.basename(base)):
                shutil.copy(os.path.join(
                    downloaded_files_dir, file), backup_path)
        logging.info(f"Backup created at {backup_path}")
    except Exception as e:
        logging.error(f"Failed to create backup: {e}")


url_file_map = load_url_file_map()


class TranslatorThread(threading.Thread):
    """Background thread for translating images."""

    def __init__(self, lang='en', download_image=False, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lang = lang
        self.download_image = download_image
        self.daemon = True
        self.stop_event = threading.Event()

    def run(self):
        try:
            with SB(uc=True, test=False, rtf=True, headless=True) as sb:

                sb.uc_open(
                    f'https://translate.google.com/?sl=auto&tl={self.lang}&op=images')
                logging.info(
                    "Background Translator: Opened Google Translate Images page")

                while not self.stop_event.is_set():
                    try:

                        task = translation_tasks.get(timeout=1)
                        image_url = task['image_url']
                        original_page_url = task['original_page_url']
                        image_index = task['image_index']
                        logging.info(f"Background Translator: Translating image {
                                     image_index} - {image_url}")

                        base64_image = self.download_image_as_base64(
                            sb, image_url)
                        if base64_image:

                            self.drag_and_drop_file(
                                sb, 'input[type="file"][accept="image/jpeg, image/png, .jpeg, .jpg, .png"]', base64_image)
                            sb.sleep(2)

                            try:
                                translated_image = sb.wait_for_element_visible(
                                    '.CMhTbb.tyW0pd img', timeout=15)
                                translated_image_blob_url = translated_image.get_attribute(
                                    "src")
                                logging.info(f"Background Translator: Retrieved translated Blob URL: {
                                             translated_image_blob_url}")
                            except Exception as e:
                                logging.error(
                                    f"Background Translator: Translated image not found: {e}")
                                self.clear_image(sb)
                                continue

                            base64_translated_image = self.download_blob_image(
                                sb, translated_image_blob_url, image_index)
                            if base64_translated_image:

                                result = {
                                    'original_page_url': original_page_url,
                                    'original_image_url': image_url,
                                    'translated_image_data': f"data:image/jpeg;base64,{base64_translated_image}"
                                }
                                translation_results.put(result)
                                logging.info(
                                    f"Background Translator: Completed translation for image {image_url}")

                                with lock:
                                    url_file_map[original_page_url].add(
                                        image_url)
                                    save_url_file_map(url_file_map)
                                    backup_shelve_db()

                            self.clear_image(sb)
                        else:
                            logging.error(
                                f"Background Translator: Failed to download image {image_url}")
                    except queue.Empty:
                        continue
                    except Exception as e:
                        logging.error(
                            f"Background Translator: Error processing task: {e}")
        except Exception as e:
            logging.error(f"Background Translator: Unexpected error: {e}")

    def download_image_as_base64(self, sb, image_url):
        """Download image from URL and convert to Base64."""
        try:
            response = requests.get(image_url)
            response.raise_for_status()
            return base64.b64encode(response.content).decode('utf-8')
        except Exception as e:
            logging.info(f"Background Translator: Failed to download image from {
                         image_url}: {e}")
            try:
                logging.info(
                    f"Background Translator: Attempting to capture screenshot from {image_url}")
                sb.driver.get(image_url)
                image_element = sb.driver.find_element(By.TAG_NAME, 'img')
                sb.driver.execute_script(
                    "arguments[0].scrollIntoView();", image_element)
                image_base64 = image_element.screenshot_as_base64
                sb.uc_open_with_reconnect(
                    f'https://translate.google.com/?sl=auto&tl={self.lang}&op=images')
                return image_base64
            except Exception as e:
                logging.error(f"Background Translator: Failed to capture screenshot from {
                              image_url}: {e}")
                return None

    def drag_and_drop_file(self, sb, file_input_selector, base64_image):
        """Simulate drag and drop of a Base64 image."""
        try:
            sb.execute_script("""
                var fileInput = document.querySelector(arguments[0]);
                var base64Image = arguments[1];
                var byteCharacters = atob(base64Image);
                var byteNumbers = new Array(byteCharacters.length);
                for (var i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                var byteArray = new Uint8Array(byteNumbers);
                var file = new File([byteArray], 'file.jpg', { type: 'image/jpeg' }); 
                var dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            """, file_input_selector, base64_image)
            logging.info(
                "Background Translator: Simulated drag and drop of the image")
        except Exception as e:
            logging.error(
                f"Background Translator: Error during drag and drop: {e}")

    def download_blob_image(self, sb, blob_url, index):
        """Download translated image from Blob URL and convert to Base64."""
        try:
            image_data = sb.execute_script("""
                return fetch(arguments[0])
                    .then(response => response.blob())
                    .then(blob => {
                        return new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    });
            """, blob_url)

            if image_data:
                base64_image = image_data.split(',')[1]
                if self.download_image:
                    folder_path = 'downloaded_files'
                    os.makedirs(folder_path, exist_ok=True)
                    file_path = os.path.join(folder_path, f'image_{index}.jpg')
                    with open(file_path, 'wb') as f:
                        f.write(base64.b64decode(base64_image))
                    logging.info(
                        f"Background Translator: Downloaded translated image to {file_path}")
                return base64_image
            else:
                logging.info(
                    "Background Translator: Failed to fetch image data from Blob URL")
                return None
        except Exception as e:
            logging.error(f"Background Translator: Error downloading Blob image from {
                          blob_url}: {e}")
            return None

    def clear_image(self, sb):
        """Click the 'Clear Image' button to reset the translator."""
        try:
            clear_button_selector = 'button.VfPpkd-Bz112c-LgbsSe.yHy1rc.eT1oJ.mN1ivc.B0czFe'
            sb.wait_for_element_visible(clear_button_selector, timeout=5)
            sb.click(clear_button_selector)
            logging.info(
                "Background Translator: Cleared the image for next translation")
        except Exception as e:
            logging.error(f"Background Translator: Error clearing image: {e}")


def run_translation(page_url, selector=None, lang='en', download_image=False, num_translators=4):
    """
    Main function to run the image translation process.

    Args:
        page_url (str): URL of the webpage to translate images on.
        selector (str, optional): CSS selector to find images. Defaults to 'img' if None.
        lang (str, optional): Target language code for translation. Defaults to 'en'.
        download_image (bool, optional): Whether to download translated images. Defaults to False.
        num_translators (int, optional): Number of background translator threads. Defaults to 4.
    """
    try:

        translator_threads = []
        for i in range(num_translators):
            translator = TranslatorThread(
                lang=lang, download_image=download_image)
            translator.start()
            translator_threads.append(translator)
            logging.info(f"Started Background Translator Thread {i+1}")

        with SB(uc=True, test=False, rtf=True, headless=False) as sb_main:
            sb_main.uc_open(page_url)
            logging.info(f"Main Browser: Opened {page_url}")

            if not selector:
                selector = "img"
                logging.info(
                    "Main Browser: No selector provided, using default selector 'img' to find all images")
            else:
                logging.info(f"Main Browser: Using provided selector '{
                             selector}' to find images")

            def find_and_queue_images(current_page_url):
                images = sb_main.find_elements(selector)
                image_urls = [
                    img.get_attribute("src")
                    for img in images
                    if img.get_attribute("src") and img.get_attribute("src").lower().endswith((".jpg", ".png", ".jpeg", ".webp"))
                ]
                logging.info(f"Main Browser: Found {
                             len(image_urls)} images on the page")

                with lock:
                    for index, image_url in enumerate(image_urls, start=1):
                        if image_url not in url_file_map[current_page_url]:
                            task = {
                                'image_url': image_url,
                                'original_page_url': current_page_url,
                                'image_index': index
                            }
                            translation_tasks.put(task)
                            logging.info(f"Main Browser: Queued image {
                                         index}: {image_url} for translation")
                            url_file_map[current_page_url].add(image_url)
                            save_url_file_map(url_file_map)
                            backup_shelve_db()

            current_page_url = sb_main.get_current_url()
            find_and_queue_images(current_page_url)

            last_url = current_page_url

            while True:
                current_url = sb_main.get_current_url()
                if current_url != last_url:
                    logging.info(
                        "--------------------------------------------------------------------------------------")
                    logging.info(f"Main Browser: URL changed to {
                                 current_url}, searching for new images...")
                    find_and_queue_images(current_url)
                    last_url = current_url

                try:
                    while True:
                        result = translation_results.get_nowait()
                        original_image_url = result['original_image_url']
                        translated_image_data = result['translated_image_data']
                        original_page_url = result['original_page_url']

                        images = sb_main.find_elements(selector)
                        for img in images:
                            src = img.get_attribute("src")
                            if src == original_image_url:

                                sb_main.execute_script(
                                    "arguments[0].src = arguments[1];", img, translated_image_data)
                                logging.info(f"Main Browser: Replaced image {
                                             original_image_url} with translated image")
                                break
                except queue.Empty:
                    pass

                sb_main.sleep(2)
    except KeyboardInterrupt:
        logging.info("Program terminated by user")
    except Exception as e:
        logging.error(f"Error in run_translation: {e}")
    finally:

        with lock:
            save_url_file_map(url_file_map)
            backup_shelve_db()
        logging.info("Saved translated images mapping to persistent storage")

        for translator in translator_threads:
            translator.stop_event.set()
        logging.info(
            "All Background Translator Threads have been signaled to stop")


if __name__ == "__main__":

    PAGE_URL = "https://manhwabtt.cc/manga/dame-skill-auto-mode-ga-kakuseishimashita-are-guild-no-scout-san-ore-wo-iranai-tte-itte-masendeshita/chapter-57-eng-li/757961"
    SELECTOR = ''
    LANGUAGE = "th"
    DOWNLOAD_IMAGE = False

    run_translation(PAGE_URL, SELECTOR, LANGUAGE, DOWNLOAD_IMAGE)
