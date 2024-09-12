let apiKey = "";
let savedClass = "";

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

  chrome.storage.local.get(["apiKey"], (result) => {
    if (result.apiKey) {
      apiKey = result.apiKey;
      document.getElementById("apiKeyInput").value = apiKey;
    }
  });

  chrome.storage.local.get(["savedClass"], (result) => {
    if (result.savedClass) {
      savedClass = result.savedClass;
      document.getElementById("classInput").value = savedClass;
    }
  });

  document.getElementById("apiKeyInput").addEventListener("change", (event) => {
    apiKey = event.target.value;
    chrome.storage.local.set({ apiKey: apiKey });
  });

  document.getElementById("classInput").addEventListener("change", (event) => {
    savedClass = event.target.value;
    chrome.storage.local.set({ savedClass: savedClass });
  });

  document
    .getElementById("translateBtn")
    .addEventListener("click", async () => {
      logProcess("Starting translation process...");
      const className = document.getElementById("classInput").value;
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

      if (selectedMode === "merge") {
        logProcess("Using merge vertical text mode.");
        await translateImagesWithVisionAPIMerge(className, targetLang, apiKey);
      } else {
        logProcess("Using normal translation mode.");
        await translateImagesWithVisionAPI(className, targetLang, apiKey);
      }
    });
});

async function translateImagesWithVisionAPI(selector, targetLang, apiKey) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabs[0].id },
        func: function (selector) {
          try {
            const elements = document.querySelectorAll(selector);

            return Array.from(elements)
              .map(
                (element) =>
                  element.src.trim() || element.getAttribute("data-src").trim()
              )
              .filter((src) => src);
          } catch (error) {
            console.error("Error finding images:", error);
          }
        },
        args: [selector],
      },
      async (results) => {
        if (chrome.runtime.lastError) {
          logError(chrome.runtime.lastError.message);
          return;
        }

        if (
          !results[0] ||
          !results[0].result ||
          results[0].result.length === 0
        ) {
          logError("No images found.");
          return;
        }

        logProcess(`Found ${results[0].result.length} images.`);
        const imageUrls = results[0].result;

        const imageProcessingTasks = imageUrls.map(async (imageUrl) => {
          try {
            logProcess(`Processing image: ${imageUrl}`);
            const textAnnotations = await processImageWithVisionAPI(
              imageUrl,
              apiKey
            );
            if (!textAnnotations || textAnnotations.length === 0) {
              logError("No text detected in the image.");
              return;
            }

            const words = extractWords(textAnnotations);
            const mergedWords = mergeWordsInSameLine(words);
            const { canvas, ctx } = await downloadAndProcessImage(imageUrl);

            for (const word of mergedWords) {
              if (!isNumberOrSymbolOrSingleChar(word.text)) {
                await removeTextWithCanvas(ctx, word);
              }
            }

            for (const word of mergedWords) {
              if (!isNumberOrSymbolOrSingleChar(word.text)) {
                const translatedText = await translateText(
                  word.text,
                  targetLang,
                  apiKey
                );
                await drawTranslatedText(ctx, word, translatedText);
              }
            }

            const canvasDataUrl = canvas.toDataURL("image/png");
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
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
                  logError("Image element not found.");
                }
              },
              args: [imageUrl, canvasDataUrl],
            });
            logProcess(`Finished processing image: ${imageUrl}`);
          } catch (error) {
            logError(error.message);
          }
        });

        await Promise.all(imageProcessingTasks);
      }
    );
  });
}

async function translateImagesWithVisionAPIMerge(selector, targetLang, apiKey) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabs[0].id },
        func: function (selector) {
          try {
            const elements = document.querySelectorAll(selector);

            return Array.from(elements)
              .map(
                (element) =>
                  element.src.trim() || element.getAttribute("data-src").trim()
              )
              .filter((src) => src);
          } catch (error) {
            console.error("Error finding images:", error);
          }
        },
        args: [selector],
      },
      async (results) => {
        if (chrome.runtime.lastError) {
          logError(chrome.runtime.lastError.message);
          return;
        }

        if (
          !results[0] ||
          !results[0].result ||
          results[0].result.length === 0
        ) {
          logError("No images found.");
          return;
        }

        logProcess(`Found ${results[0].result.length} images.`);
        const imageUrls = results[0].result;

        const imageProcessingTasks = imageUrls.map(async (imageUrl) => {
          try {
            logProcess(`Processing image: ${imageUrl}`);
            const textAnnotations = await processImageWithVisionAPI(
              imageUrl,
              apiKey
            );
            if (!textAnnotations || textAnnotations.length === 0) {
              logError("No text detected in the image.");
              return;
            }

            const words = extractWords(textAnnotations);
            const mergedWords = mergeWords(words);
            const { canvas, ctx } = await downloadAndProcessImage(imageUrl);

            for (const word of mergedWords) {
              if (!isNumberOrSymbolOrSingleChar(word.text)) {
                await removeTextWithCanvas(ctx, word);
              }
            }

            for (const word of mergedWords) {
              if (!isNumberOrSymbolOrSingleChar(word.text)) {
                const translatedText = await translateText(
                  word.text,
                  targetLang,
                  apiKey
                );
                await drawTranslatedText(ctx, word, translatedText);
              }
            }

            const canvasDataUrl = canvas.toDataURL("image/png");
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
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
                  logError("Image element not found.");
                }
              },
              args: [imageUrl, canvasDataUrl],
            });
            logProcess(`Finished processing image: ${imageUrl}`);
          } catch (error) {
            logError(error.message);
          }
        });

        await Promise.all(imageProcessingTasks);
      }
    );
  });
}

function mergeWordsInSameLine(words) {
  const mergedWords = [];
  let currentLine = [];
  let currentY = null;

  for (const word of words) {
    if (currentY === null || Math.abs(word.bbox.y0 - currentY) <= 10) {
      if (
        currentLine.length === 0 ||
        shouldCombineWordsHorizontally(
          currentLine[currentLine.length - 1],
          word
        )
      ) {
        currentLine.push(word);
        currentY = word.bbox.y0;
      } else {
        mergedWords.push(combineWords(currentLine));
        currentLine = [word];
        currentY = word.bbox.y0;
      }
    } else {
      mergedWords.push(combineWords(currentLine));
      currentLine = [word];
      currentY = word.bbox.y0;
    }
  }

  if (currentLine.length > 0) {
    mergedWords.push(combineWords(currentLine));
  }

  return mergedWords;
}

function shouldCombineWordsHorizontally(word1, word2) {
  const gap = word2.bbox.x0 - word1.bbox.x1;
  return gap >= 0 && gap <= 20;
}

function combineWords(line) {
  const text = line.map((word) => word.text).join(" ");
  const x0 = Math.min(...line.map((word) => word.bbox.x0));
  const y0 = Math.min(...line.map((word) => word.bbox.y0));
  const x1 = Math.max(...line.map((word) => word.bbox.x1));
  const y1 = Math.max(...line.map((word) => word.bbox.y1));
  return { text, bbox: { x0, y0, x1, y1 } };
}

function isNumberOrSymbolOrSingleChar(text) {
  const isNumber = /^\d+$/.test(text);
  const isSymbol = /^[!@#\$%\^\&*\)\(+=._-]+$/.test(text);
  const isSingleChar = text.length === 1;
  return isNumber || isSymbol || isSingleChar;
}

async function downloadAndProcessImage(imageUrl) {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const img = await createImageBitmap(blob);

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  return { canvas, ctx };
}

async function removeTextWithCanvas(ctx, word) {
  const { x0, x1, y0, y1 } = word.bbox;
  const margin = 2;
  const width = x1 - x0 + margin * 2;
  const height = y1 - y0 + margin * 2;

  ctx.fillStyle = "white";
  ctx.fillRect(x0 - margin, y0 - margin, width, height);
}

async function drawTranslatedText(ctx, word, translatedText) {
  const { x0, x1, y0, y1 } = word.bbox;
  const width = x1 - x0;
  const height = y1 - y0;

  ctx.fillStyle = "white";
  ctx.fillRect(x0, y0, width, height);

  let fontSize = height * 0.8;
  if (fontSize < 12) {
    fontSize = 12;
  }

  ctx.fillStyle = "black";
  ctx.font = `${fontSize}px Arial`;
  const textMetrics = ctx.measureText(translatedText);

  if (textMetrics.width > width) {
    const scaleFactor = width / textMetrics.width;
    ctx.font = `${fontSize * scaleFactor}px Arial`;
  }

  if (translatedText.length > 1 && translatedText.includes(" ")) {
    wrapText(ctx, translatedText, x0, y1 - height * 0.2, width, height);
  } else {
    ctx.fillText(translatedText, x0, y1 - height * 0.2);
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
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

function extractWords(textAnnotations) {
  logProcess("Extracting words from annotations");

  return textAnnotations.slice(1).map((word) => {
    const vertices = word.boundingPoly.vertices;
    return {
      text: word.description,
      bbox: {
        x0: vertices[0].x || 0,
        y0: vertices[0].y || 0,
        x1: vertices[2].x || 0,
        y1: vertices[2].y || 0,
      },
    };
  });
}

function mergeWords(words) {
  logProcess("Merging words");
  const mergedWords = [];
  let currentLine = [];
  let currentY = null;

  for (const word of words) {
    if (currentY === null || Math.abs(word.bbox.y0 - currentY) <= 50) {
      if (
        currentLine.length === 0 ||
        shouldCombine(currentLine[currentLine.length - 1], word)
      ) {
        currentLine.push(word);
        currentY = word.bbox.y0;
      } else {
        mergedWords.push(combineLine(currentLine));
        currentLine = [word];
        currentY = word.bbox.y0;
      }
    } else {
      mergedWords.push(combineLine(currentLine));
      currentLine = [word];
      currentY = word.bbox.y0;
    }
  }

  if (currentLine.length > 0) {
    mergedWords.push(combineLine(currentLine));
  }

  return mergedWords;
}

function shouldCombine(word1, word2) {
  const gap = word2.bbox.x0 - word1.bbox.x1;
  return gap >= 0 && gap <= 10;
}

function combineLine(line) {
  const text = line.map((word) => word.text).join(" ");
  const x0 = Math.min(...line.map((word) => word.bbox.x0));
  const y0 = Math.min(...line.map((word) => word.bbox.y0));
  const x1 = Math.max(...line.map((word) => word.bbox.x1));
  const y1 = Math.max(...line.map((word) => word.bbox.y1));
  return { text, bbox: { x0, y0, x1, y1 } };
}

async function processImageWithVisionAPI(imageUrl, apiKey) {
  try {
    logProcess(`Sending image to Vision API: ${imageUrl}`);
    const imageBase64 = await getBase64FromImageUrl(imageUrl);
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
    const requestBody = {
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: "TEXT_DETECTION" }],
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    if (data.responses[0].textAnnotations) {
      return data.responses[0].textAnnotations;
    } else {
      throw new Error("No text detected");
    }
  } catch (error) {
    throw new Error(`Vision API error: ${error.message}`);
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
