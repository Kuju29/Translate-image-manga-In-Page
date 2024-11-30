import threading, requests, base64, os, logging, sys, queue, time
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.dialogs import Messagebox
from tkinter import scrolledtext
from tkinter import PhotoImage
from selenium.webdriver.common.by import By
from seleniumbase import SB

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

downloaded_files_dir = 'downloaded_files'
os.makedirs(downloaded_files_dir, exist_ok=True)

class TranslationApp:
    def __init__(self, root):
        self.root = root
        self.root.title("")
        self.root = root
        self.root.title('Ghost Manga UI v3.0')
        # self.root.iconbitmap("C:\\Translate-image-manga-In-Page\\177005_cdisplay_manga_icon.ico")

        style = ttk.Style()
        self.root.geometry("700x700")
        self.root.resizable(False, False)

        self.translation_thread = None
        self.translator_threads = []
        self.stop_event = threading.Event()
        self.translation_tasks = queue.Queue()
        self.translation_results = queue.Queue()
        self.total_images = 0
        self.processed_images = 0

        self.create_widgets()

    def create_widgets(self):

        self.main_frame = ttk.Frame(self.root, padding=20)
        self.main_frame.grid(row=0, column=0, sticky="nsew")
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)

        self.main_frame.columnconfigure(0, weight=1)

        input_frame = ttk.Frame(self.main_frame)
        input_frame.grid(row=0, column=0, sticky="ew", pady=(0,10))
        input_frame.columnconfigure(0, weight=1) 

        self.url_label = ttk.Label(input_frame, text="Page URL:")
        self.url_label.grid(row=0, column=0, sticky=W, pady=5)
        self.url_entry = ttk.Entry(input_frame)
        self.url_entry.grid(row=1, column=0, sticky=EW, pady=5) 

        self.lang_label = ttk.Label(input_frame, text="Target Language (e.g., 'en' for English, 'th' for Thai):")
        self.lang_label.grid(row=2, column=0, sticky=W, pady=5)
        self.lang_entry = ttk.Entry(input_frame)
        self.lang_entry.insert(0, 'th')
        self.lang_entry.grid(row=3, column=0, sticky=EW, pady=5) 

        self.selector_label = ttk.Label(input_frame, text="CSS Selector for Images (optional):")
        self.selector_label.grid(row=4, column=0, sticky=W, pady=5)
        self.selector_entry = ttk.Entry(input_frame)
        self.selector_entry.insert(0, 'img')
        self.selector_entry.grid(row=5, column=0, sticky=EW, pady=5) 

        self.num_translators_label = ttk.Label(input_frame, text="Number of Translators (default 2):")
        self.num_translators_label.grid(row=6, column=0, sticky=W, pady=5)
        self.num_translators_spinbox = ttk.Spinbox(input_frame, from_=1, to=10, width=5)
        self.num_translators_spinbox.set(2)
        self.num_translators_spinbox.grid(row=7, column=0, sticky=W, pady=5) 

        options_frame = ttk.Frame(self.main_frame)
        options_frame.grid(row=1, column=0, sticky="ew", pady=(0,10))
        options_frame.columnconfigure(0, weight=1) 

        self.headless_var = ttk.BooleanVar(value=True)
        self.headless_check = ttk.Checkbutton(options_frame, text="Run translators in headless mode", variable=self.headless_var)
        self.headless_check.grid(row=0, column=0, sticky=W) 

        self.download_var = ttk.BooleanVar(value=False)
        self.download_check = ttk.Checkbutton(options_frame, text="Download translated images", variable=self.download_var)
        self.download_check.grid(row=1, column=0, sticky=W) 

        buttons_frame = ttk.Frame(self.main_frame)
        buttons_frame.grid(row=3, column=0, pady=(0,10))
        buttons_frame.columnconfigure(0, weight=1)
        buttons_frame.columnconfigure(1, weight=0)
        buttons_frame.columnconfigure(2, weight=0)
        buttons_frame.columnconfigure(3, weight=1)

        self.start_button = ttk.Button(buttons_frame, text="Start Translation", bootstyle=SUCCESS, command=self.start_translation)
        self.start_button.grid(row=0, column=1, padx=5)

        self.stop_button = ttk.Button(buttons_frame, text="Stop Translation", bootstyle=DANGER, command=self.stop_translation)
        self.stop_button.grid(row=0, column=2, padx=5)
        self.stop_button.config(state='disabled') 

        self.log_text = scrolledtext.ScrolledText(self.main_frame, state='disabled', height=15)
        self.log_text.grid(row=4, column=0, sticky="nsew")
        self.main_frame.rowconfigure(4, weight=1)

    def start_translation(self):
        page_url = self.url_entry.get()
        lang = self.lang_entry.get()
        selector = self.selector_entry.get()
        num_translators = int(self.num_translators_spinbox.get())
        headless = self.headless_var.get()
        download_image = self.download_var.get()

        if not page_url:
            Messagebox.show_error("Please enter a valid URL.", "Error")
            return

        self.start_button.config(state='disabled')
        self.stop_button.config(state='normal')

        self.translation_thread = threading.Thread(
            target=self.run_translation,
            args=(page_url, selector, lang,
                  num_translators, headless, download_image)
        )
        self.translation_thread.start()

    def stop_translation(self):
        if self.stop_event:
            self.stop_event.set()
            logging.info("Stopping translation threads...")
            for translator in self.translator_threads:
                translator.join()
            logging.info("Translator threads stopped.")
        self.start_button.config(state='normal')
        self.stop_button.config(state='disabled')

    def run_translation(self, page_url, selector, lang, num_translators, headless, download_image):
        self.stop_event = threading.Event()
        try:

            logger = logging.getLogger()
            logger.handlers = []
            handler = logging.StreamHandler(self.LogHandler(self.log_text))
            handler.setFormatter(logging.Formatter(
                '%(asctime)s - %(levelname)s - %(message)s'))
            logger.addHandler(handler) 

            self.translation_tasks = queue.Queue()
            self.translation_results = queue.Queue()
            self.total_images = 0
            self.processed_images = 0
            self.stop_event.clear()

            run_translation(
                page_url=page_url,
                selector=selector,
                lang=lang,
                num_translators=num_translators,
                headless=headless,
                download_image=download_image,
                stop_event=self.stop_event,
                translation_tasks=self.translation_tasks,
                translation_results=self.translation_results,
                translator_threads=self.translator_threads,
                app=self
            )

        except Exception as e:
            logging.error(f"An error occurred: {e}")
        finally:
            self.start_button.config(state='normal')
            self.stop_button.config(state='disabled')

    class LogHandler:
        def __init__(self, text_widget):
            self.text_widget = text_widget

        def write(self, message):
            self.text_widget.configure(state='normal')
            self.text_widget.insert('end', message)
            self.text_widget.configure(state='disabled')
            self.text_widget.see('end')

        def flush(self):
            pass

def run_translation(page_url, selector='img', lang='en', num_translators=4, headless=True, download_image=False, stop_event=None, translation_tasks=None, translation_results=None, translator_threads=None, app=None):
    if stop_event is None:
        stop_event = threading.Event()
    try:

        if translation_tasks is None:
            translation_tasks = queue.Queue()
        if translation_results is None:
            translation_results = queue.Queue()
        if translator_threads is None:
            translator_threads = []

        with SB(uc=True, test=False, rtf=True, headless=False) as sb_main:
            sb_main.open(page_url)
            logging.info(f"Main Browser: Opened {page_url}")

            current_url = sb_main.get_current_url()
            last_url = current_url

            last_navigation_start = sb_main.execute_script("return window.performance.timing.navigationStart;")

            while not stop_event.is_set():
                logging.info(f"Main Browser: Processing URL {current_url}")

                if not translator_threads:
                    for i in range(num_translators):
                        translator = TranslatorThread(
                            translation_tasks=translation_tasks,
                            translation_results=translation_results,
                            lang=lang,
                            headless=headless,
                            download_image=download_image,
                            stop_event=stop_event,
                            app=app
                        )
                        translator.start()
                        translator_threads.append(translator)
                        logging.info(f"Started Translator Thread {i+1}")

                process_page(
                    sb_main=sb_main,
                    current_url=current_url,
                    selector=selector,
                    translation_tasks=translation_tasks,
                    translation_results=translation_results,
                    download_image=download_image,
                    app=app
                )

                while True:
                    time.sleep(2)
                    new_url = sb_main.get_current_url()

                    current_navigation_start = sb_main.execute_script("return window.performance.timing.navigationStart;")

                    if new_url != current_url or current_navigation_start != last_navigation_start:
                        if new_url != current_url:
                            logging.info(f"Main Browser: URL changed to {new_url}")
                        else:
                            logging.info("Main Browser: Page reloaded")

                        current_url = new_url
                        last_navigation_start = current_navigation_start

                        stop_event.set()
                        for translator in translator_threads:
                            translator.join()
                        logging.info("Translator threads stopped due to URL change or page reload.")

                        translation_tasks.queue.clear()
                        translation_results.queue.clear()
                        app.translator_threads = []
                        app.stop_event.clear()
                        app.total_images = 0
                        app.processed_images = 0

                        translator_threads = []
                        break

                    while not translation_results.empty():
                        result = translation_results.get()
                        image_url = result['image_url']
                        translated_image_data = result['translated_image_data']

                        images = sb_main.find_elements(selector)
                        for img in images:
                            src = img.get_attribute("src")
                            if src == image_url:
                                sb_main.execute_script(
                                    "arguments[0].src = arguments[1];", img, translated_image_data)
                                logging.info(
                                    f"Main Browser: Replaced image {image_url} with translated image")
                                app.processed_images += 1
                                break

                        if app.processed_images >= app.total_images:
                            logging.info("All images have been processed. Stopping translator threads.")
                            stop_event.set()
                            for translator in translator_threads:
                                translator.join()
                            logging.info("Translator threads stopped.")
                            translator_threads.clear()
                            break

    except Exception as e:
        logging.error(f"Error in run_translation: {e}")
        stop_event.set()


def process_page(sb_main, current_url, selector, translation_tasks, translation_results, download_image, app=None):
    try:
        images = sb_main.find_elements(selector)
        if not images:
            logging.warning("Main Browser: No images found on the page.")
            return

        image_urls = [
            img.get_attribute("src")
            for img in images
            if img.get_attribute("src") and img.get_attribute("src").split('?')[0].lower().endswith((".jpg", ".png", ".jpeg", ".webp"))
        ]
        logging.info(f"Main Browser: Found {len(image_urls)} images on the page") 

        if app:
            app.total_images = len(image_urls)
            app.processed_images = 0

        for index, image_url in enumerate(image_urls, start=1):
            task = {
                'image_url': image_url,
                'image_index': index
            }
            if task not in translation_tasks.queue:
                translation_tasks.put(task)
                logging.info(f"Main Browser: Queued image {index}: {image_url} for translation")
            else:
                logging.info(f"Main Browser: Image {image_url} is already in the queue")

    except Exception as e:
        logging.error(f"Error in process_page: {e}")


class TranslatorThread(threading.Thread):
    def __init__(self, translation_tasks, translation_results, lang='en', headless=True, download_image=False, stop_event=None, app=None):
        super().__init__()
        self.translation_tasks = translation_tasks
        self.translation_results = translation_results
        self.lang = lang
        self.headless = headless
        self.download_image = download_image
        self.daemon = True
        self.stop_event = stop_event or threading.Event()
        self.app = app

    def run(self):
        with SB(uc=True, test=False, rtf=True, headless=self.headless) as sb_translate:
            try:
                sb_translate.open(
                    f'https://translate.google.com/?sl=auto&tl={self.lang}&op=images')
                logging.info("Translator: Opened Google Translate Images page")

                while not self.stop_event.is_set():
                    if self.app.processed_images >= self.app.total_images:
                        logging.info("Translator: All images processed, exiting.")
                        break

                    try:
                        task = self.translation_tasks.get(timeout=1)
                    except queue.Empty:
                        continue

                    image_url = task['image_url']
                    image_index = task['image_index']
                    logging.info(f"Translator: Translating image {image_index} - {image_url}")

                    base64_image = download_image_as_base64(
                        sb_translate, image_url)
                    if base64_image:
                        drag_and_drop_file(
                            sb_translate,
                            'input[type="file"][accept="image/jpeg, image/png, .jpeg, .jpg, .png"]',
                            base64_image
                        )
                        sb_translate.sleep(2)

                        try:
                            translated_image = sb_translate.wait_for_element_visible(
                                '.CMhTbb.tyW0pd img', timeout=15)
                            translated_image_blob_url = translated_image.get_attribute(
                                "src")
                            logging.info(f"Translator: Retrieved translated Blob URL: {translated_image_blob_url}")
                        except Exception as e:
                            logging.error(f"Translator: Translated image not found: {e}")
                            clear_image(sb_translate)
                            continue

                        base64_translated_image = download_blob_image(
                            sb_translate,
                            translated_image_blob_url,
                            image_index,
                            self.download_image
                        )
                        if base64_translated_image:
                            translated_image_data = f"data:image/jpeg;base64,{base64_translated_image}"

                            result = {
                                'image_url': image_url,
                                'translated_image_data': translated_image_data
                            }
                            self.translation_results.put(result)
                            logging.info(f"Translator: Completed translation for image {image_url}")

                        clear_image(sb_translate)
                    else:
                        logging.error(f"Translator: Failed to download image {image_url}")

            except Exception as e:
                logging.error(f"Translator: Unexpected error: {e}")
            finally:
                pass


def download_image_as_base64(sb_translate, image_url):
    try:
        response = requests.get(image_url)
        response.raise_for_status()
        return base64.b64encode(response.content).decode('utf-8')
    except Exception as e:
        logging.info(f"Translator: Failed to download image from {image_url}: {e}")
        try:
            logging.info(f"Translator: Attempting to capture screenshot from {image_url}")
            sb_translate.driver.get(image_url)
            image_element = sb_translate.driver.find_element(
                By.TAG_NAME, 'img')
            sb_translate.driver.execute_script(
                "arguments[0].scrollIntoView();", image_element)
            image_base64 = image_element.screenshot_as_base64
            sb_translate.open(
                f'https://translate.google.com/?sl=auto&tl=en&op=images')
            return image_base64
        except Exception as e:
            logging.error(f"Translator: Failed to capture screenshot from {image_url}: {e}")
            return None


def drag_and_drop_file(sb_translate, file_input_selector, base64_image):
    try:
        sb_translate.execute_script("""
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
        logging.info("Translator: Simulated drag and drop of the image")
    except Exception as e:
        logging.error(f"Translator: Error during drag and drop: {e}")


def download_blob_image(sb_translate, blob_url, index, download_image):
    try:
        image_data = sb_translate.execute_script("""
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
            if download_image:
                folder_path = 'downloaded_files'
                os.makedirs(folder_path, exist_ok=True)
                file_path = os.path.join(folder_path, f'image_{index}.jpg')
                with open(file_path, 'wb') as f:
                    f.write(base64.b64decode(base64_image))
                logging.info(f"Translator: Downloaded translated image to {file_path}")
            return base64_image
        else:
            logging.info("Translator: Failed to fetch image data from Blob URL")
            return None
    except Exception as e:
        logging.error(f"Translator: Error downloading Blob image from {blob_url}: {e}")
        return None


def clear_image(sb_translate):
    try:
        clear_button_selector = 'button.VfPpkd-Bz112c-LgbsSe.yHy1rc.eT1oJ.mN1ivc.B0czFe'
        sb_translate.wait_for_element_visible(clear_button_selector, timeout=5)
        sb_translate.click(clear_button_selector)
    except Exception as e:
        logging.error(f"Translator: Error clearing image: {e}")

if __name__ == "__main__":
    root = ttk.Window(themename='superhero')
    app = TranslationApp(root)
    root.mainloop()
