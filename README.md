# Translate Images in Manga In-Page

### [Watch the Demo](https://youtu.be/EVLBudGqJ9k)

I created this extension for personal use, but feel free to take this idea and improve upon it. The project was built entirely using ChatGPT, and while some of the code may be unnecessary, I decided to leave it as is for now. Future updates will refine and optimize the code further.

### Working Principle
This Chrome extension finds the URLs of images on a page using a specified class, performs OCR (Optical Character Recognition) on those images, translates the text, and replaces the original images with new, translated versions.

---

## Requirements

1. **Google Chrome**
2. Install the Chrome extension: [Allow CORS: Access-Control-Allow-Origin](https://chromewebstore.google.com/detail/allow-cors-access-control/lhobafahddgcelffkeicbaginigeejlf) and enable it.
3. Get a [Google API Key](https://console.cloud.google.com/apis/credentials) for OCR and translation services.
4. Ensure **all images** have the same class. This extension **cannot be used on websites that use blob images as links**.

---

## CSS Selector Guide

Below are common CSS selectors and their abbreviations, which the extension uses to find and manipulate images:

| Full Form (HTML Attribute)                  | Abbreviation (CSS Selector)            |
|---------------------------------------------|----------------------------------------|
| `[class="image-container"]`                 | `.image-container`                     |
| `[id="main-header"]`                        | `#main-header`                         |
| `[rel="stylesheet"]`                        | `link[rel="stylesheet"]`               |
| `[href="https://example.com"]`              | `a[href="https://example.com"]`        |
| `[type="submit"]`                           | `input[type="submit"]`                 |
| `[role="navigation"]`                       | `[role="navigation"]`                  |
| `[data-toggle="dropdown"]`                  | `[data-toggle="dropdown"]`             |
| `[alt="Image description"]`                 | `img[alt="Image description"]`         |
| `[src^="https://"]`                         | `img[src^="https://"]`                 |
| `[name="email"]`                            | `input[name="email"]`                  |
| `[value="Search"]`                          | `input[value="Search"]`                |
| `[class="image-container"] > img`           | `.image-container > img`               |
| `[class="button primary"] > span`           | `.button.primary > span`               |
| `div[class="content"] p`                    | `div.content p`                        |
| `[class="nav"] ul > li[class="nav-item"]`   | `.nav ul > li.nav-item`                |
| `[class="menu-item"] a:hover`               | `.menu-item a:hover`                   |
| `[class="form-group"] input[type="text"]`   | `.form-group input[type="text"]`       |
| `[class="gallery"] div[class="gallery-item"]`| `.gallery div.gallery-item`            |

---

## Download & Setup

1. [Download the extension](https://github.com/Kuju29/Translate-image-manga-In-Page/archive/refs/heads/main.zip)
2. Unzip the downloaded file: `Translate-image-manga-In-Page-main`
3. Compress all the files in the folder to make them ready for installation in Google Chrome.
![image](https://github.com/user-attachments/assets/6aa87cda-220f-4ea9-b922-c3312f113780)
---

## Installation Steps

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer Mode**
3. Drag and drop the zipped file into the `chrome://extensions/` page
4. Click the extensions icon, input your API key and other necessary data
5. Done! Your extension is ready to use.

---

### Important Notes

- This extension hasn't been tested on many websites yet, so there may be edge cases where it doesn't work as expected.
- After you're done using the extension, make sure to disable the **Allow CORS: Access-Control-Allow-Origin** Chrome extension to avoid issues with other websites.

---

## Screenshots

![image](https://github.com/user-attachments/assets/796514c6-d29f-4572-b2df-14aae1c98a28)
![image](https://github.com/user-attachments/assets/63c7f018-10e1-456d-88d3-cb79577a6e48)
![image](https://github.com/user-attachments/assets/50570a94-a518-4e06-86f3-5fbff136d12f)

---

### Future Updates
I'll continue refining this project and removing unnecessary code in future updates. Stay tuned!
