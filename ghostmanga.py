from seleniumbase import SB
from urllib.parse import urlparse
import requests, base64, time

original_page_url = ('https://rawkuma.com/takarakuji-de-40-oku-atattandakedo-isekai-ni-ijuu-suru-chapter-85/', '[class*="ts-main-image"]')
lang = 'th'

class ImageTranslator:
    def __init__(self, sb_instance):
        self.sb = sb_instance
        self.url_file_map = {}

    def urls_match(url1, url2):
        return urlparse(url1)._replace(query=None) == urlparse(url2)._replace(query=None)
    
    def download_image_as_base64(self, image_url):
        """Download image from URL and return as Base64."""
        response = requests.get(image_url)
        if response.status_code == 200:
            return base64.b64encode(response.content).decode('utf-8')
        else:
            raise Exception(f"Failed to download image from {image_url}")

    def drag_and_drop_file(self, file_input_selector, base64_image):
        """Simulate drag and drop of a Base64 image directly."""
        self.sb.execute_script("""
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
        """, file_input_selector, base64_image) # จำลองการลาก

    def download_blob_image(self, blob_url):
        """Fetch the translated image as Base64 from the blob URL."""
        try:
            image_data = self.sb.execute_script("""
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
                return base64_image
            else:
                print("Failed to fetch the image data from the blob URL.")
                return None
        except Exception as e:
            print(f"Error downloading the blob image: {e}")
            return None

    def translate_image(self, image_url, original_page_url, index):
        """Process a single image for translation, unless already translated."""
        try:

            if original_page_url not in self.url_file_map:
                self.url_file_map[original_page_url] = {}

            if image_url in self.url_file_map[original_page_url]:
                print(
                    f"Image {image_url} already translated. Skipping translation.")
                return

            base64_image = self.download_image_as_base64(image_url)
            self.drag_and_drop_file(
                'input[type="file"][accept="image/jpeg, image/png, .jpeg, .jpg, .png"]', base64_image) # <input id="ucj-39" type="file" name="file" class="ZdLswd" accept="image/jpeg, image/png, .jpeg, .jpg, .png" jsname="qGt1Bf" jsaction="change:bK2emb; click:fUEfwd;"> 

            translated_image = self.sb.wait_for_element_visible(
                '.CMhTbb.tyW0pd img', timeout=2) # <div class="CMhTbb tyW0pd"><img class="Jmlpdc" loading="lazy" src="blob:https://translate.google.com/a1af381d-235d-4521-aac4-dfe8cee3e964" alt="9
            translated_image_blob_url = translated_image.get_attribute("src")
            print(f"Translated Blob URL: {translated_image_blob_url}")

            base64_translated_image = self.download_blob_image(
                translated_image_blob_url)

            if base64_translated_image:

                self.url_file_map[original_page_url][image_url] = f"data:image/jpeg;base64,{
                    base64_translated_image}"

        except Exception as e:
            print(f"Error processing image {image_url}: {e}")
            return None

    def replace_images_in_original_page(self, original_page_url, selector):
        """Replace all original image URLs in the original page by finding elements via class."""
        try:
            self.sb.open(original_page_url)

            translated_images = self.url_file_map.get(original_page_url, {})

            for original_url, base64_image_data in translated_images.items():
                script = f"""
                    var imgElements = document.querySelectorAll('{selector}');
                    for (var img of imgElements) {{
                        var imgSrc = img.src.split('?')[0];  // ตัด query string ออก
                        if (imgSrc === '{original_url}') {{
                            img.src = '{base64_image_data}';
                            console.log("Replaced image with translated image: {base64_image_data}");
                        }}
                    }}
                """
                self.sb.execute_script(script)
                print(f"Replaced image {original_url} with translated image (Base64)")

        except Exception as e:
            print(f"Error replacing images: {e}")

    def clear_image(self):
        """Click the 'Clear Image' button using updated button structure."""
        try:
            clear_button_selector = 'button.VfPpkd-Bz112c-LgbsSe.yHy1rc.eT1oJ.mN1ivc.B0czFe' # <button class="VfPpkd-Bz112c-LgbsSe yHy1rc eT1oJ mN1ivc B0czFe" jscontroller="soHxf" jsaction="click:cOuCgd; mousedown:UX7yZ; 
            self.sb.wait_for_element_visible(clear_button_selector, timeout=2)
            self.sb.click(clear_button_selector)
            print("Cleared the image.")
        except Exception as e:
            print(f"Failed to clear the image: {e}")

    def process_images(self, image_urls, original_page_url, selector):
        """Process all images for translation, skipping already translated ones."""

        if original_page_url not in self.url_file_map:
            self.url_file_map[original_page_url] = {}

        untranslated_images = [
            img_url for img_url in image_urls if img_url not in self.url_file_map[original_page_url]]

        if len(untranslated_images) == 1:
            print("Found 1 untranslated image. Skipping translation.")
            self.replace_images_in_original_page(original_page_url, selector)
            return

        if untranslated_images:
            print(f"Found {len(untranslated_images)
                           } untranslated images. Starting translation.")
            for index, image_url in enumerate(untranslated_images):
                print(f"Processing image: {image_url}")
                self.translate_image(image_url, original_page_url, index)
                self.clear_image()

        print("Returning to original page to replace images.")
        self.replace_images_in_original_page(original_page_url, selector)

    def monitor_url_change_and_translate(self, original_url, selector):
        """Monitor URL changes and trigger translation process when necessary."""
        last_url = original_url
        while True:
            current_url = self.sb.get_current_url()
            if current_url != last_url:
                print(f"URL changed to {current_url}. Checking for images...")

                try:
                    images = self.sb.find_elements(selector)
                    if images:
                        print(
                            f"Found {len(images)} images. Starting translation...")
                        image_urls = [img.get_attribute("src") for img in images if img.get_attribute("src").endswith((".jpg", ".png", ".jpeg", ".webp"))]

                        self.sb.uc_open_with_reconnect(
                            f'https://translate.google.com/?sl=auto&tl={lang}&op=images')
                        self.process_images(image_urls, current_url, selector)
                    else:
                        print("No images found on this page.")
                except Exception as e:
                    print(f"Error finding images: {e}")

                last_url = current_url

with SB(uc=True, test=False, rtf=True, headless=False) as sb:
    try:
        page_url, selector = original_page_url

        sb.open(page_url)

        images = sb.find_elements(selector)
        image_urls = [img.get_attribute("src") for img in images if img.get_attribute("src").endswith((".jpg", ".png", ".jpeg", ".webp"))]

        if not image_urls:
            print("No image URLs found")
        else:
            print(f"Found {len(image_urls)} images. Processing...")

        translator = ImageTranslator(sb)

        sb.uc_open_with_reconnect(
            f'https://translate.google.com/?sl=auto&tl={lang}&op=images')

        translator.process_images(image_urls, page_url, selector)
        translator.monitor_url_change_and_translate(page_url, selector)

    except Exception as e:
        print(f"Error: {e}")
