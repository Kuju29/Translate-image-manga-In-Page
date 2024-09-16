let apiKey = "";
let savedClass = "";

const APINormal = "DOCUMENT_TEXT_DETECTION";
const APIMerge = "TEXT_DETECTION";
const TextMerge = 50;
const Verticalboxlength = 50;
const blockss = false;

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["logs"], function (result) {
    const logs = result.logs || [];
    const errorMessage = document.getElementById("errorMessage");
    logs.forEach((log) => {
      const logEntry = document.createElement("div");
      logEntry.textContent = log;
      errorMessage.appendChild(logEntry);
    });

    const logContainer = document.getElementById("errorLog");
    logContainer.scrollTop = logContainer.scrollHeight;
  });

  chrome.storage.local.get(["userSelections"], (result) => {
    const selections = result.userSelections || {};

    if (selections.apiKey) {
      apiKey = selections.apiKey;
      document.getElementById("apiKeyInput").value = selections.apiKey;
    }
    if (selections.className) {
      document.getElementById("manualClassInput").value = selections.className;
    }
    if (selections.language) {
      document.getElementById("languageSelect").value = selections.language;
    }
    if (selections.translationMode) {
      document.querySelector(
        `input[name="translationMode"][value="${selections.translationMode}"]`
      ).checked = true;
    }
  });

  document.getElementById("apiKeyInput").addEventListener("change", (event) => {
    apiKey = event.target.value;
    saveUserSelection("apiKey", event.target.value);
  });

  document
    .getElementById("manualClassInput")
    .addEventListener("change", (event) => {
      saveUserSelection("className", event.target.value);
    });

  document
    .getElementById("languageSelect")
    .addEventListener("change", (event) => {
      saveUserSelection("language", event.target.value);
    });

  document
    .querySelectorAll('input[name="translationMode"]')
    .forEach((radio) => {
      radio.addEventListener("change", (event) => {
        saveUserSelection("translationMode", event.target.value);
      });
    });

  document.getElementById("classSelect").addEventListener("change", (event) => {
    const selectedClass = event.target.value;
    document.getElementById("manualClassInput").value = selectedClass;
    saveUserSelection("className", selectedClass);
  });

  function saveUserSelection(key, value) {
    chrome.storage.local.get(["userSelections"], (result) => {
      const selections = result.userSelections || {};
      selections[key] = value;
      chrome.storage.local.set({ userSelections: selections });
    });
  }

  document
    .getElementById("modeSelect")
    .addEventListener("change", async function () {
      const manualInput = document.getElementById("manualClassInput");
      const autoSearchContainer = document.getElementById(
        "autoSearchContainer"
      );

      if (this.value === "manual") {
        manualInput.style.display = "block";
        autoSearchContainer.style.display = "none";
      } else if (this.value === "auto") {
        manualInput.style.display = "none";
        autoSearchContainer.style.display = "flex";

        const tabs = await getActiveTabs();
        chrome.scripting.executeScript(
          {
            target: { tabId: tabs[0].id },
            func: function () {
              const images = document.querySelectorAll(
                "img[src$='.jpeg'], img[src$='.jpg'], img[src$='.png'], img[src$='.webp']"
              );
              const selectorsWithImages = new Set();

              images.forEach((img) => {
                let currentElement = img;

                const buildSelector = (element) => {
                  let selector = element.tagName.toLowerCase();

                  if (element.id) {
                    selector += `#${element.id}`;
                  }

                  if (element.classList.length > 0) {
                    selector += "." + Array.from(element.classList).join(".");
                  }

                  return selector;
                };

                for (let i = 0; i < 3; i++) {
                  currentElement = currentElement.parentElement;
                  if (!currentElement) break;

                  const selector = buildSelector(currentElement);
                  const matchedImages = currentElement.querySelectorAll("img");

                  if (matchedImages.length > 3) {
                    selectorsWithImages.add(selector);
                    break;
                  }
                }
              });

              return Array.from(selectorsWithImages);
            },
          },
          (results) => {
            if (chrome.runtime.lastError) {
              logError(chrome.runtime.lastError.message);
              return;
            }

            const foundSelectors = results[0].result;
            const selectElement = document.getElementById("classSelect");
            selectElement.innerHTML =
              '<option value="" disabled selected>Select a CSS class</option>';

            if (foundSelectors.length > 0) {
              foundSelectors.forEach((selector) => {
                const option = document.createElement("option");
                option.value = selector + " img";
                option.textContent = selector + " img";
                selectElement.appendChild(option);
              });
            } else {
              logError(
                "No CSS Selector found for parent with more than 3 images."
              );
            }
          }
        );
      }
    });

  document
    .getElementById("translateBtn")
    .addEventListener("click", async () => {
      logProcess("Starting translation process...");

      let className = "";
      if (document.getElementById("modeSelect").value === "manual") {
        className = document.getElementById("manualClassInput").value;
      } else {
        className = document.getElementById("classSelect").value;
      }

      const targetLang = document.getElementById("languageSelect").value;
      chrome.storage.local.set({ logs: [] });

      if (!apiKey) {
        logError("API Key is missing.");
        return;
      }

      if (!className) {
        logError("Class is missing.");
        return;
      }

      const selectedMode = document.querySelector(
        'input[name="translationMode"]:checked'
      ).value;
      logProcess(`Selected translation mode: ${selectedMode}`);

      const tabs = await getActiveTabs();

      let translator;

      if (selectedMode === "merge") {
        logProcess("Using merge vertical text mode.");
        translator = new APIMergeMode(className, targetLang, apiKey, tabs);
      } else {
        logProcess("Using normal translation mode.");
        translator = new APINormalMode(className, targetLang, apiKey, tabs);
      }

      await translator.translateImages();
    });
});

function getActiveTabs() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(tabs);
    });
  });
}

class APINormalMode {
  constructor(selector, targetLang, apiKey, tabs) {
    this.selector = selector;
    this.targetLang = targetLang;
    this.apiKey = apiKey;
    this.tabs = tabs;
  }

  async translateImages() {
    const imageUrls = await this.getImageUrls();
    if (!imageUrls || imageUrls.length === 0) {
      logError("No images found.");
      return;
    }
    logProcess(`Found ${imageUrls.length} images.`);

    const imageProcessingTasks = imageUrls.map(async (imageUrl) => {
      try {
        logProcess(`Processing image: ${imageUrl}`);
        const textAnnotations = await processImageWithVisionAPI(
          imageUrl,
          this.apiKey,
          APINormal
        );
        if (!textAnnotations || textAnnotations.length === 0) {
          logError("No text detected in the image.");
          return;
        }

        const words = this.extractWords(textAnnotations);
        const mergedWords = this.mergeWordsInSameLine(words);
        const { canvas, ctx } = await this.downloadAndProcessImage(imageUrl);

        for (const word of mergedWords) {
          if (!this.isNumberOrSymbolOrSingleChar(word.text)) {
            await this.removeTextWithCanvas(ctx, word);
          }
        }

        for (const word of mergedWords) {
          if (!this.isNumberOrSymbolOrSingleChar(word.text)) {
            const translatedText = await translateText(
              word.text,
              this.targetLang,
              this.apiKey
            );
            await this.drawTranslatedText(ctx, word, translatedText);
          }
        }

        const canvasDataUrl = canvas.toDataURL("image/png");
        await this.replaceImageInPage(imageUrl, canvasDataUrl);
        logProcess(`Finished processing image: ${imageUrl}`);
      } catch (error) {
        logError(error.message);
      }
    });

    await Promise.all(imageProcessingTasks);
  }

  getImageUrls() {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: this.tabs[0].id },
          func: function (selector) {
            try {
              const elements = document.querySelectorAll(`${selector}`);

              return Array.from(elements)
                .map(
                  (element) =>
                    element.src.trim() ||
                    element.getAttribute("data-src").trim()
                )
                .filter((src) => src);
            } catch (error) {
              console.error("Error finding images:", error);
              return [];
            }
          },
          args: [this.selector],
        },
        (results) => {
          if (chrome.runtime.lastError) {
            logError(chrome.runtime.lastError.message);
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(results[0].result);
        }
      );
    });
  }

  extractWords(fullTextAnnotation) {
    logProcess("Extracting words from fullTextAnnotation");

    const words = [];

    fullTextAnnotation.pages.forEach((page) => {
      page.blocks.forEach((block) => {
        block.paragraphs.forEach((paragraph) => {
          paragraph.words.forEach((word) => {
            const text = word.symbols.map((s) => s.text).join("");
            const vertices = word.boundingBox.vertices;
            words.push({
              text: text,
              bbox: {
                x0: vertices[0].x || 0,
                y0: vertices[0].y || 0,
                x1: vertices[2].x || 0,
                y1: vertices[2].y || 0,
              },
            });
          });
        });
      });
    });

    return words;
  }

  mergeWordsInSameLine(words) {
    const mergedWords = [];
    let currentLine = [];
    let currentY = null;

    for (const word of words) {
      if (currentY === null || Math.abs(word.bbox.y0 - currentY) <= 10) {
        if (
          currentLine.length === 0 ||
          this.shouldCombineWordsHorizontally(
            currentLine[currentLine.length - 1],
            word
          )
        ) {
          currentLine.push(word);
          currentY = word.bbox.y0;
        } else {
          mergedWords.push(this.combineWords(currentLine));
          currentLine = [word];
          currentY = word.bbox.y0;
        }
      } else {
        mergedWords.push(this.combineWords(currentLine));
        currentLine = [word];
        currentY = word.bbox.y0;
      }
    }

    if (currentLine.length > 0) {
      mergedWords.push(this.combineWords(currentLine));
    }

    return mergedWords;
  }

  shouldCombineWordsHorizontally(word1, word2) {
    const gap = word2.bbox.x0 - word1.bbox.x1;
    return gap >= 0 && gap <= 20;
  }

  combineWords(line) {
    const text = line.map((word) => word.text).join(" ");
    const x0 = Math.min(...line.map((word) => word.bbox.x0));
    const y0 = Math.min(...line.map((word) => word.bbox.y0));
    const x1 = Math.max(...line.map((word) => word.bbox.x1));
    const y1 = Math.max(...line.map((word) => word.bbox.y1));
    return { text, bbox: { x0, y0, x1, y1 } };
  }

  isNumberOrSymbolOrSingleChar(text) {
    const isNumber = /^\d+$/.test(text);
    const isSymbol = /^[!@#\$%\^\&*\)\(+=._-]+$/.test(text);
    const isSingleChar = text.length <= 1;
    return isNumber || isSymbol || isSingleChar;
  }

  async downloadAndProcessImage(imageUrl) {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const img = await createImageBitmap(blob);

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    return { canvas, ctx };
  }

  async removeTextWithCanvas(ctx, word) {
    const { x0, x1, y0, y1 } = word.bbox;
    const margin = 2;

    const imgWidth = ctx.canvas.width;
    const imgHeight = ctx.canvas.height;

    const validX0 = Math.max(0, Math.min(x0 - margin, imgWidth - 1));
    const validY0 = Math.max(0, Math.min(y0 - margin, imgHeight - 1));
    const validX1 = Math.max(0, Math.min(x1 + margin, imgWidth));
    const validY1 = Math.max(0, Math.min(y1 + margin, imgHeight));
    const validWidth = validX1 - validX0;
    const validHeight = validY1 - validY0;

    this.applyMosaicBlurAndWhite(
      ctx,
      validX0,
      validY0,
      validWidth,
      validHeight
    );
  }

  applyMosaicBlurAndWhite(ctx, x, y, width, height) {
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;
    const mosaicSize = 5;
    const blurAmount = 3;
    const fadeFactor = 0.5;
    const whiteFactor = 0.3;

    for (let row = 0; row < height; row += mosaicSize) {
      for (let col = 0; col < width; col += mosaicSize) {
        let totalRed = 0,
          totalGreen = 0,
          totalBlue = 0;
        let pixelCount = 0;

        for (
          let mosaicRow = -blurAmount;
          mosaicRow <= mosaicSize + blurAmount;
          mosaicRow++
        ) {
          for (
            let mosaicCol = -blurAmount;
            mosaicCol <= mosaicSize + blurAmount;
            mosaicCol++
          ) {
            const pixelX = Math.min(width - 1, Math.max(0, col + mosaicCol));
            const pixelY = Math.min(height - 1, Math.max(0, row + mosaicRow));
            const pixelIndex = (pixelY * width + pixelX) * 4;

            totalRed += data[pixelIndex];
            totalGreen += data[pixelIndex + 1];
            totalBlue += data[pixelIndex + 2];
            pixelCount++;
          }
        }

        const avgRed = totalRed / pixelCount;
        const avgGreen = totalGreen / pixelCount;
        const avgBlue = totalBlue / pixelCount;

        for (let mosaicRow = 0; mosaicRow < mosaicSize; mosaicRow++) {
          for (let mosaicCol = 0; mosaicCol < mosaicSize; mosaicCol++) {
            const pixelX = Math.min(width - 1, col + mosaicCol);
            const pixelY = Math.min(height - 1, row + mosaicRow);
            const pixelIndex = (pixelY * width + pixelX) * 4;

            data[pixelIndex] = Math.min(
              255,
              avgRed +
                (255 - avgRed) * whiteFactor +
                (255 - avgRed) * fadeFactor
            );
            data[pixelIndex + 1] = Math.min(
              255,
              avgGreen +
                (255 - avgGreen) * whiteFactor +
                (255 - avgGreen) * fadeFactor
            );
            data[pixelIndex + 2] = Math.min(
              255,
              avgBlue +
                (255 - avgBlue) * whiteFactor +
                (255 - avgBlue) * fadeFactor
            );
          }
        }
      }
    }

    ctx.putImageData(imageData, x, y);
  }

  async drawTranslatedText(ctx, word, translatedText) {
    const { x0, x1, y0, y1 } = word.bbox;
    const width = x1 - x0;
    const height = y1 - y0;

    let fontSize = height * 0.8;
    const minFontSize = 16;
    if (fontSize < minFontSize) {
      fontSize = minFontSize;
    }

    ctx.fillStyle = "black";
    ctx.font = `${fontSize}px Arial`;
    const textMetrics = ctx.measureText(translatedText);

    if (textMetrics.width > width) {
      const scaleFactor = width / textMetrics.width;
      const scaledFontSize = fontSize * scaleFactor;

      if (scaledFontSize >= minFontSize) {
        ctx.font = `${scaledFontSize}px Arial`;
      } else {
        ctx.font = `${minFontSize}px Arial`;
      }
    }

    if (translatedText.length > 1 && translatedText.includes(" ")) {
      this.wrapText(ctx, translatedText, x0, y1 - height * 0.2, width, height);
    } else {
      ctx.fillText(translatedText, x0, y1 - height * 0.2);
    }
  }

  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + " ";
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  }

  async replaceImageInPage(imageUrl, canvasDataUrl) {
    chrome.scripting.executeScript({
      target: { tabId: this.tabs[0].id },
      func: function (imageUrl, canvasDataUrl) {
        const img = document.querySelector(
          `img[src="${imageUrl}"], img[data-src="${imageUrl}"], img[data-lazy="${imageUrl}"]`
        );
        if (img) {
          img.src = canvasDataUrl;
          img.setAttribute("data-src", canvasDataUrl);
          img.setAttribute("data-lazy", canvasDataUrl);

          img.classList.remove("lazyload", "lazyloaded");

          if (img.hasAttribute("data-srcset")) {
            img.setAttribute("data-srcset", canvasDataUrl);
          }
          if (img.hasAttribute("srcset")) {
            img.setAttribute("srcset", canvasDataUrl);
          }
        } else {
        }
      },
      args: [imageUrl, canvasDataUrl],
    });
  }
}

class APIMergeMode {
  constructor(selector, targetLang, apiKey, tabs) {
    this.selector = selector;
    this.targetLang = targetLang;
    this.apiKey = apiKey;
    this.tabs = tabs;
  }

  async translateImages() {
    const imageUrls = await this.getImageUrls();
    if (!imageUrls || imageUrls.length === 0) {
      logError("No images found.");
      return;
    }
    logProcess(`Found ${imageUrls.length} images.`);

    const imageProcessingTasks = imageUrls.map(async (imageUrl) => {
      try {
        logProcess(`Processing image: ${imageUrl}`);
        const fullTextAnnotation = await processImageWithVisionAPI(
          imageUrl,
          this.apiKey,
          APIMerge
        );
        if (!fullTextAnnotation) {
          logError("No text detected in the image.");
          return;
        }
        const blocks = this.extractBlocks(fullTextAnnotation);

        const { canvas, ctx } = await this.downloadAndProcessImage(imageUrl);

        for (const block of blocks) {
          await this.removeTextWithCanvas(ctx, block);
        }

        const drawDynami = this.drawDynamicBoundingBoxes(
          ctx,
          fullTextAnnotation
        );

        console.log("Starting text translation process...");

        for (let i = 0; i < drawDynami.length; i++) {
          const { leftX, topY, rightX, bottomY, textInside } = drawDynami[i];

          try {
            drawDynami[i].translatedText = await translateText(
              textInside,
              this.targetLang,
              this.apiKey
            );
            console.log(`Translation successful for box ${i}.`);
          } catch (error) {
            console.error(`Error translating text for box ${i}:`, error);
            drawDynami[i].translatedText = null;
          }
        }
        console.log("Translation process completed.", drawDynami);

        for (let i = 0; i < drawDynami.length; i++) {
          const { leftX, topY, rightX, bottomY, translatedText } =
            drawDynami[i];

          if (!translatedText) {
            console.log(`No translated text for box ${i}, skipping.`);
            continue;
          }

          if ([leftX, topY, rightX, bottomY].includes(undefined)) {
            console.error(
              `Invalid bounding box coordinates for box ${i}: (${leftX}, ${topY}) to (${rightX}, ${bottomY})`
            );
            continue;
          }

          try {
            await this.drawTranslatedText(
              ctx,
              { bbox: { x0: leftX, y0: topY, x1: rightX, y1: bottomY } },
              translatedText
            );
            console.log(`Successfully drew translated text for box ${i}.`);
          } catch (error) {
            console.error(`Error drawing translated text for box ${i}:`, error);
          }
        }

        console.log(
          "Text rendering process completed. Creating image data URL."
        );

        const canvasDataUrl = canvas.toDataURL("image/png");
        await this.replaceImageInPage(imageUrl, canvasDataUrl);
        logProcess(`Finished processing image: ${imageUrl}`);
      } catch (error) {
        logError(error.message);
      }
    });

    await Promise.all(imageProcessingTasks);
  }

  drawBoundingBox(ctx, bbox, color = "red", lineWidth = 2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.rect(bbox.x0, bbox.y0, bbox.x1 - bbox.x0, bbox.y1 - bbox.y0);
    ctx.stroke();
  }

  mergeBoundingBoxesInXDirection(words, xThreshold = TextMerge) {
    let mergedBoundingBoxes = [];
    let currentGroup = [];

    words.forEach((word, index) => {
      const { x0, y0, x1, y1, text } = word;

      if (currentGroup.length === 0) {
        currentGroup.push({ x0, y0, x1, y1, text });
      } else {
        const previousWord = currentGroup[currentGroup.length - 1];
        if (Math.abs(previousWord.x1 - x0) <= xThreshold) {
          currentGroup.push({ x0, y0, x1, y1, text });
        } else {
          if (currentGroup.length === 1) {
            mergedBoundingBoxes.push(currentGroup[0]);
          } else {
            const mergedBbox = {
              x0: Math.min(...currentGroup.map((w) => w.x0)),
              y0: Math.min(...currentGroup.map((w) => w.y0)),
              x1: Math.max(...currentGroup.map((w) => w.x1)),
              y1: Math.max(...currentGroup.map((w) => w.y1)),
              text: currentGroup.map((w) => w.text).join(" "),
            };
            mergedBoundingBoxes.push(mergedBbox);
          }

          currentGroup = [{ x0, y0, x1, y1, text }];
        }
      }

      if (index === words.length - 1 && currentGroup.length > 0) {
        if (currentGroup.length === 1) {
          mergedBoundingBoxes.push(currentGroup[0]);
        } else {
          const mergedBbox = {
            x0: Math.min(...currentGroup.map((w) => w.x0)),
            y0: Math.min(...currentGroup.map((w) => w.y0)),
            x1: Math.max(...currentGroup.map((w) => w.x1)),
            y1: Math.max(...currentGroup.map((w) => w.y1)),
            text: currentGroup.map((w) => w.text).join(" "),
          };
          mergedBoundingBoxes.push(mergedBbox);
        }
      }
    });

    return mergedBoundingBoxes;
  }

  drawDynamicBoundingBoxes(ctx, fullTextAnnotation) {
    let allWords = [];
    let usedGroups = [];
    let drawnBoundingBoxes = [];

    fullTextAnnotation.pages.forEach((page) => {
      page.blocks.forEach((block) => {
        block.paragraphs.forEach((paragraph) => {
          let words = paragraph.words.map((word) => {
            const vertices = word.boundingBox.vertices;
            return {
              x0: vertices[0].x || 0,
              y0: vertices[0].y || 0,
              x1: vertices[2].x || 0,
              y1: vertices[2].y || 0,
              height: vertices[2].y - vertices[0].y,
              text: word.symbols.map((symbol) => symbol.text).join(""),
            };
          });

          const mergedBoxes = this.mergeBoundingBoxesInXDirection(words);

          mergedBoxes.forEach((box) => allWords.push(box));
        });
      });
    });

    if (allWords.length > 0) {
      allWords.forEach((box) => {
        const centerX = (box.x0 + box.x1) / 2;
        const boxHeight = box.y1 - box.y0;

        const isGroupUsed = usedGroups.some(
          (group) =>
            Math.abs(group.centerX - centerX) < 10 &&
            group.yRange[0] <= box.y1 &&
            group.yRange[1] >= box.y0
        );

        if (!isGroupUsed) {
          let totalHeight = Verticalboxlength;
          let currentY = box.y0;

          let topY = box.y0;
          let bottomY = box.y1;
          let leftX = box.x0;
          let rightX = box.x1;

          allWords.forEach((innerBox) => {
            if (centerX >= innerBox.x0 && centerX <= innerBox.x1) {
              const gap = Math.abs(innerBox.y0 - currentY);
              if (gap <= boxHeight * 2) {
                totalHeight += innerBox.y1 - innerBox.y0;
                currentY = innerBox.y1;

                topY = Math.min(topY, innerBox.y0);
                bottomY = Math.max(bottomY, innerBox.y1);
                leftX = Math.min(leftX, innerBox.x0);
                rightX = Math.max(rightX, innerBox.x1);
              }
            }
          });

          if (blockss) {
            const endY = currentY + totalHeight;

            ctx.strokeStyle = "green";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(centerX, box.y0);
            ctx.lineTo(centerX, endY);
            ctx.stroke();

            ctx.strokeStyle = "red";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(leftX, topY, rightX - leftX, bottomY - topY);
            ctx.stroke();
          }

          drawnBoundingBoxes.push({
            leftX,
            topY,
            rightX,
            bottomY,
            textInside: this.checkTextInsideBoundingBox(
              { x0: leftX, y0: topY, x1: rightX, y1: bottomY },
              allWords
            ),
          });

          usedGroups.push({
            centerX: centerX,
            yRange: [topY, bottomY],
          });

          usedGroups = usedGroups.map((group) => ({
            centerX: group.centerX,
            yRange: [
              Math.min(group.yRange[0], topY),
              Math.max(group.yRange[1], bottomY),
            ],
          }));
        }
      });
    }

    return drawnBoundingBoxes;
  }

  checkTextInsideBoundingBox(mergedBox, allWords) {
    let textInsideBox = [];

    allWords.forEach((word) => {
      const { x0, y0, x1, y1, text } = word;

      const isInside =
        x0 >= mergedBox.x0 &&
        x1 <= mergedBox.x1 &&
        y0 >= mergedBox.y0 &&
        y1 <= mergedBox.y1;

      if (isInside) {
        textInsideBox.push(text);
      }
    });

    return textInsideBox.join(" ");
  }

  async getImageUrls() {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: this.tabs[0].id },
          func: function (selector) {
            try {
              const elements = document.querySelectorAll(`${selector}`);

              return Array.from(elements)
                .map(
                  (element) =>
                    element.src.trim() ||
                    element.getAttribute("data-src").trim()
                )
                .filter((src) => src);
            } catch (error) {
              console.error("Error finding images:", error);
            }
          },
          args: [this.selector],
        },
        (results) => {
          if (chrome.runtime.lastError) {
            logError(chrome.runtime.lastError.message);
            reject(chrome.runtime.lastError);
            return;
          }

          if (
            !results[0] ||
            !results[0].result ||
            results[0].result.length === 0
          ) {
            logError("No images found.");
            resolve([]);
            return;
          }

          resolve(results[0].result);
        }
      );
    });
  }

  extractBlocks(fullTextAnnotation) {
    logProcess("Extracting blocks from fullTextAnnotation");

    const blocks = [];

    fullTextAnnotation.pages.forEach((page) => {
      page.blocks.forEach((block) => {
        let blockText = "";
        block.paragraphs.forEach((paragraph) => {
          paragraph.words.forEach((word) => {
            const wordText = word.symbols.map((s) => s.text).join("");
            blockText += wordText;
          });
        });

        const vertices = block.boundingBox.vertices;

        let blockType = "paragraph";

        blocks.push({
          text: blockText.trim(),
          bbox: {
            x0: vertices[0].x || 0,
            y0: vertices[0].y || 0,
            x1: vertices[2].x || 0,
            y1: vertices[2].y || 0,
          },
          type: blockType,
        });
      });
    });

    return blocks;
  }

  async downloadAndProcessImage(imageUrl) {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const img = await createImageBitmap(blob);

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    return { canvas, ctx };
  }

  async removeTextWithCanvas(ctx, word) {
    const { x0, x1, y0, y1 } = word.bbox;
    const margin = 2;

    const imgWidth = ctx.canvas.width;
    const imgHeight = ctx.canvas.height;

    const validX0 = Math.max(0, Math.min(x0 - margin, imgWidth - 1));
    const validY0 = Math.max(0, Math.min(y0 - margin, imgHeight - 1));
    const validX1 = Math.max(0, Math.min(x1 + margin, imgWidth));
    const validY1 = Math.max(0, Math.min(y1 + margin, imgHeight));
    const validWidth = validX1 - validX0;
    const validHeight = validY1 - validY0;

    this.applyMosaicBlurAndWhite(
      ctx,
      validX0,
      validY0,
      validWidth,
      validHeight
    );
  }

  applyMosaicBlurAndWhite(ctx, x, y, width, height) {
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;
    const mosaicSize = 5;
    const blurAmount = 3;
    const fadeFactor = 0.5;
    const whiteFactor = 0.3;

    for (let row = 0; row < height; row += mosaicSize) {
      for (let col = 0; col < width; col += mosaicSize) {
        let totalRed = 0,
          totalGreen = 0,
          totalBlue = 0;
        let pixelCount = 0;

        for (
          let mosaicRow = -blurAmount;
          mosaicRow <= mosaicSize + blurAmount;
          mosaicRow++
        ) {
          for (
            let mosaicCol = -blurAmount;
            mosaicCol <= mosaicSize + blurAmount;
            mosaicCol++
          ) {
            const pixelX = Math.min(width - 1, Math.max(0, col + mosaicCol));
            const pixelY = Math.min(height - 1, Math.max(0, row + mosaicRow));
            const pixelIndex = (pixelY * width + pixelX) * 4;

            totalRed += data[pixelIndex];
            totalGreen += data[pixelIndex + 1];
            totalBlue += data[pixelIndex + 2];
            pixelCount++;
          }
        }

        const avgRed = totalRed / pixelCount;
        const avgGreen = totalGreen / pixelCount;
        const avgBlue = totalBlue / pixelCount;

        for (let mosaicRow = 0; mosaicRow < mosaicSize; mosaicRow++) {
          for (let mosaicCol = 0; mosaicCol < mosaicSize; mosaicCol++) {
            const pixelX = Math.min(width - 1, col + mosaicCol);
            const pixelY = Math.min(height - 1, row + mosaicRow);
            const pixelIndex = (pixelY * width + pixelX) * 4;

            data[pixelIndex] = Math.min(
              255,
              avgRed +
                (255 - avgRed) * whiteFactor +
                (255 - avgRed) * fadeFactor
            );
            data[pixelIndex + 1] = Math.min(
              255,
              avgGreen +
                (255 - avgGreen) * whiteFactor +
                (255 - avgGreen) * fadeFactor
            );
            data[pixelIndex + 2] = Math.min(
              255,
              avgBlue +
                (255 - avgBlue) * whiteFactor +
                (255 - avgBlue) * fadeFactor
            );
          }
        }
      }
    }

    ctx.putImageData(imageData, x, y);
  }

  async drawTranslatedText(ctx, block, translatedText) {
    const { x0, x1, y0, y1 } = block.bbox;
    const width = x1 - x0;
    const height = y1 - y0;

    let fontSize = Math.min(height * 0.8, 40);

    const minFontSize = 12;
    if (fontSize < minFontSize) {
      fontSize = minFontSize;
    }

    ctx.font = `${fontSize}px Arial`;

    let lineHeight = fontSize * 1.2;
    let lines = [];
    let totalTextHeight = 0;

    while (true) {
      lines = this.wrapText(ctx, translatedText, width);
      totalTextHeight = lines.length * lineHeight;

      if (totalTextHeight <= height || fontSize <= minFontSize) {
        break;
      } else {
        fontSize -= 1;
        ctx.font = `${fontSize}px Arial`;
        lineHeight = fontSize * 1.2;
      }
    }

    ctx.fillStyle = "black";

    let startY = y0 + (height - totalTextHeight) / 2 + lineHeight * 0.8;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineMetrics = ctx.measureText(line);
      const textX = x0 + (width - lineMetrics.width) / 2;
      ctx.fillText(line, textX, startY);
      startY += lineHeight;
    }
  }

  wrapText(ctx, text, maxWidth) {
    const words = this.segmentThaiText(text);
    const lines = [];
    let line = "";

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i];
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && line !== "") {
        lines.push(line);
        line = words[i];
      } else {
        line = testLine;
      }
    }
    if (line !== "") {
      lines.push(line);
    }

    return lines;
  }

  segmentThaiText(text) {
    return text.split("");
  }

  async replaceImageInPage(imageUrl, canvasDataUrl) {
    chrome.scripting.executeScript({
      target: { tabId: this.tabs[0].id },
      func: function (imageUrl, canvasDataUrl) {
        const img = document.querySelector(
          `img[src="${imageUrl}"], img[data-src="${imageUrl}"], img[data-lazy="${imageUrl}"]`
        );
        if (img) {
          img.src = canvasDataUrl;
          img.setAttribute("data-src", canvasDataUrl);
          img.setAttribute("data-lazy", canvasDataUrl);

          img.classList.remove("lazyload", "lazyloaded");

          if (img.hasAttribute("data-srcset")) {
            img.setAttribute("data-srcset", canvasDataUrl);
          }
          if (img.hasAttribute("srcset")) {
            img.setAttribute("srcset", canvasDataUrl);
          }
        } else {
        }
      },
      args: [imageUrl, canvasDataUrl],
    });
  }
}

async function translateText(text, targetLang, apiKey) {
  try {
    logProcess(`Translating text: ${text}`);
    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
    const requestBody = {
      q: text,
      target: targetLang,
      format: "text",
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();
    if (
      result.data &&
      result.data.translations &&
      result.data.translations.length > 0
    ) {
      return result.data.translations[0].translatedText;
    } else {
      throw new Error("Translation failed");
    }
  } catch (error) {
    throw new Error("Failed to translate text.");
  }
}

async function processImageWithVisionAPI(imageUrl, apiKey, features) {
  try {
    logProcess(`Sending image to Vision API: ${imageUrl}`);
    const imageBase64 = await getBase64FromImageUrl(imageUrl);
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
    const requestBody = {
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: features }],
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    if (data.responses[0].fullTextAnnotation) {
      return data.responses[0].fullTextAnnotation;
    } else {
      throw new Error("No text detected");
    }
  } catch (error) {
    throw new Error(`Vision API error: ${error.message}`);
  }
}

async function getBase64FromImageUrl(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function logError(message) {
  const errorLog = document.getElementById("errorMessage");
  errorLog.innerHTML += `<div>${message}</div>`;
  const logContainer = document.getElementById("errorLog");
  logContainer.scrollTop = logContainer.scrollHeight;
}

function logProcess(message) {
  const logEntry = document.createElement("div");
  logEntry.textContent = message;
  const errorMessage = document.getElementById("errorMessage");
  errorMessage.appendChild(logEntry);

  chrome.storage.local.get(["logs"], function (result) {
    const logs = result.logs || [];
    logs.push(message);
    chrome.storage.local.set({ logs: logs });
  });

  const logContainer = document.getElementById("errorLog");
  logContainer.scrollTop = logContainer.scrollHeight;
}
