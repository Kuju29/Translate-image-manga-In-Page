# https://youtu.be/EVLBudGqJ9k

I created this for my own use, but there may be others who take this idea and improve it. I built it entirely using ChatGPT, and some code may be unnecessary, but I didn’t remove it. I will update it again later.

Working principle: It uses a class to find the URLs of images, performs OCR on those images, then translates and replaces the URLs with the new translated images

# Needed
1. google chrome
2. install [Allow CORS: Access-Control-Allow-Origin](https://chromewebstore.google.com/detail/allow-cors-access-control/lhobafahddgcelffkeicbaginigeejlf) and trun on
3. Api [google key](https://console.cloud.google.com/apis/credentials)
4. CSS selector (All images should have the same class, and they cannot be used on websites that use blob images as links)

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

5. [Download](https://github.com/Kuju29/Translate-image-manga-In-Page/archive/refs/heads/main.zip)
6. Unzip `Translate-image-manga-In-Page-main`
7. Zip file only file in folder `Translate-image-manga-In-Page`

# Install
1. Open `Developer mode` in `chrome://extensions/`
2. Move file .zip to `chrome://extensions/`
3. Click extensions icon
4. input data
5. done

I haven't tested it on many websites yet.\
Make sure to turn off `Allow CORS: Access-Control-Allow-Origin` every time after you are not using this extension.

![image](https://github.com/user-attachments/assets/796514c6-d29f-4572-b2df-14aae1c98a28)

![image](https://github.com/user-attachments/assets/63c7f018-10e1-456d-88d3-cb79577a6e48)

![image](https://github.com/user-attachments/assets/50570a94-a518-4e06-86f3-5fbff136d12f)
