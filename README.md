# Translate Images in Manga In-Page "Extension" and "Program"

### [Watch the Demo](https://youtu.be/EVLBudGqJ9k)

I created this extension for personal use, but feel free to take this idea and improve upon it. The project was built entirely using ChatGPT, and while some of the code may be unnecessary, I decided to leave it as is for now. Future updates will refine and optimize the code further.

I have made two versions: 'Translate-image-manga-In-Page,' which is an extension that requires the Google API and comes with costs, and 'ghostmanga.py,' which is a script with a UI that's free and easy to use. The details are below. I created them because they share the same code structure but are used differently. I hope everyone will like them.

### Working Principle
This Chrome extension finds the URLs of images on a page using a specified class, performs OCR (Optical Character Recognition) on those images, translates the text, and replaces the original images with new, translated versions.

---

## Requirements

1. **Google Chrome**
2. Go to [API & Services > Library](https://console.cloud.google.com/apis/library) in the Google Cloud Console.
   - Search for **Vision API** and click to enable it.
3. fter enabling the APIs, go to [API & Services > Credentials](https://console.cloud.google.com/apis/credentials) to create your API key:
   - Click on **Create Credentials**.
   - Select **API Key**.
   - Copy the API Key and save it securely.
4. Ensure **all images** have the same class. This extension **cannot be used on websites that use blob images and Protected websites**.

---

## Download & Setup

1. [Download the extension](https://github.com/Kuju29/Translate-image-manga-In-Page/archive/refs/heads/main.zip)
2. Unzip the downloaded file: `Translate-image-manga-In-Page-main.zip`
---

## Installation Steps

1. Open Chrome and go to `chrome://extensions/`
2. Enable `Developer Mode`
3. Cilck `Load unpacked`
4. Select Folder `Translate-image-manga-In-Page-main`
5. Done! Your extension is ready to use.


#### If you want the extension to not disappear when the folder is deleted or moved:
1. Go to `Translate-image-manga-In-Page` folder
2. Compress all the files inside, including any subfolders, into a .zip file.
3. Drag the .zip file into `chrome://extensions/`
4. Done.

---

## Version Updates

- **v1.4**: Will add free OCR but it is not available yet.
- **v1.3**: Upgraded the Merge mode for improved translation accuracy, but there are still issues with missing text detection and disorganized word groups when applied to images with tightly packed text. (I have fixed these issues.)
- **v1.2**: Added a new UI and CSS Selector options.
- **v1.1**: Implemented image detection on web pages.

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

If you want to search for all the images on the page, you can use the selector as just 'img', as shown in the image.
![image](https://github.com/user-attachments/assets/71e4fe65-c222-4f41-adea-1fb7aaeca5f1)


---
- There are still problems with dynamic word merging.

![image](https://github.com/user-attachments/assets/ae7a6c83-fbd0-4008-97db-c7e7aa551b64)

---

## Screenshots

![image](https://github.com/user-attachments/assets/91b81b3e-b49c-4cb8-a24b-5f663b6aa533)
![image](https://github.com/user-attachments/assets/63c7f018-10e1-456d-88d3-cb79577a6e48)
![image](https://github.com/user-attachments/assets/50570a94-a518-4e06-86f3-5fbff136d12f)

---

### [Ghost Manga](https://github.com/Kuju29/Translate-image-manga-In-Page/blob/main/ghostmanga.py)

![image](https://github.com/user-attachments/assets/72881819-0d6a-4a8b-a2ed-1e5d7f680bde)\
![image](https://github.com/user-attachments/assets/4d1c0b21-60b8-4cff-bdb8-b8f3f12ec5c4)



