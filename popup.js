let apiKey = "";
let savedClass = "";

document.addEventListener("DOMContentLoaded", () => {
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

  document.getElementById("translateBtn").addEventListener("click", () => {
    const className = document.getElementById("classInput").value;
    const targetLang = document.getElementById("languageSelect").value;

    if (!apiKey) {
      logError("API Key is missing.");
      return;
    }

    if (!className) {
      logError("Class is missing.");
      return;
    }

    translateImagesWithVisionAPI(className, targetLang, apiKey);
  });
});
function translateImagesWithVisionAPI(className, targetLang) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabs[0].id },
        func: function (className) {
          const images = document.querySelectorAll(`.${className}`);
          return Array.from(images).map((img) => img.src);
        },
        args: [className],
      },
      (results) => {
        if (chrome.runtime.lastError) {
          logError(chrome.runtime.lastError.message);
          return;
        }

        const imageUrls = results[0].result;

        imageUrls.forEach(async (imageUrl) => {
          try {
            const textAnnotations = await processImageWithVisionAPI(imageUrl);

            const mergedAnnotations = mergeNearbyAnnotations(textAnnotations);

            const translatedAnnotations = await Promise.all(
              mergedAnnotations.map(async (annotation) => {
                const translatedText = await translateText(
                  annotation.description,
                  targetLang
                );
                return { ...annotation, translatedText };
              })
            );

            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: function (imageUrl, translatedAnnotations) {
                const img = document.querySelector(`img[src="${imageUrl}"]`);
                if (!img) return;

                const canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext("2d");

                const crossImg = new Image();
                crossImg.crossOrigin = "anonymous";
                crossImg.src = img.src;

                crossImg.onload = function () {
                  ctx.drawImage(crossImg, 0, 0);

                  function splitTextIntoLines(ctx, text, maxWidth) {
                    const words = text.split(" ");
                    let lines = [];
                    let currentLine = words[0];

                    for (let i = 1; i < words.length; i++) {
                      const word = words[i];
                      const width = ctx.measureText(
                        currentLine + " " + word
                      ).width;
                      if (width < maxWidth) {
                        currentLine += " " + word;
                      } else {
                        lines.push(currentLine);
                        currentLine = word;
                      }
                    }
                    lines.push(currentLine);
                    return lines;
                  }

                  for (const annotation of translatedAnnotations) {
                    const translatedText = annotation.translatedText;
                    const vertices = annotation.boundingPoly.vertices;

                    const x = vertices[0].x;
                    const y = vertices[0].y;
                    const height = vertices[3].y - vertices[0].y;

                    const fontSize = height * 1.2;
                    ctx.font = `${fontSize}px Arial`;

                    const translatedWidth =
                      ctx.measureText(translatedText).width;

                    const paddingX = 5;
                    const paddingY = 2;

                    ctx.fillStyle = "white";
                    ctx.fillRect(
                      x - paddingX,
                      y - fontSize + paddingY,
                      translatedWidth + paddingX * 2,
                      fontSize + paddingY * 2
                    );

                    const lines = splitTextIntoLines(
                      ctx,
                      translatedText,
                      translatedWidth
                    );

                    ctx.fillStyle = "black";
                    lines.forEach((line, index) => {
                      ctx.fillText(line, x, y + index * fontSize);
                    });
                  }

                  img.src = canvas.toDataURL("image/png");
                };

                crossImg.onerror = function () {
                  console.error("Failed to load cross-origin image.");
                };
              },
              args: [imageUrl, translatedAnnotations],
            });
          } catch (error) {
            logError(error);
          }
        });
      }
    );
  });
}

function mergeNearbyAnnotations(annotations) {
  let mergedAnnotations = [];

  annotations.forEach((annotation) => {
    if (mergedAnnotations.length === 0) {
      mergedAnnotations.push(annotation);
    } else {
      const lastAnnotation = mergedAnnotations[mergedAnnotations.length - 1];
      const lastY = lastAnnotation.boundingPoly.vertices[0].y;
      const currentY = annotation.boundingPoly.vertices[0].y;

      if (Math.abs(currentY - lastY) < 30) {
        lastAnnotation.description += " " + annotation.description;
      } else {
        mergedAnnotations.push(annotation);
      }
    }
  });

  return mergedAnnotations;
}

function splitTextIntoLines(ctx, text, maxWidth) {
  const words = text.split(" ");
  let lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

async function processImageWithVisionAPI(imageUrl) {
  return new Promise(async (resolve, reject) => {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
    const imageBase64 = await getBase64FromImageUrl(imageUrl);

    const requestBody = {
      requests: [
        {
          image: {
            content: imageBase64,
          },
          features: [
            {
              type: "TEXT_DETECTION",
            },
          ],
        },
      ],
    };

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    })
      .then((response) => response.json())
      .then((data) => {
        const annotations = data.responses[0].textAnnotations;
        if (annotations && annotations.length > 0) {
          const textAnnotations = annotations.slice(1);
          resolve(textAnnotations);
        } else {
          reject("No text detected");
        }
      })
      .catch((error) => reject(error));
  });
}

async function translateText(text, targetLang) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      target: targetLang,
    }),
  });

  const result = await response.json();
  return result.data.translations[0].translatedText;
}

function getBase64FromImageUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;
    img.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = this.width;
      canvas.height = this.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(this, 0, 0);
      const dataURL = canvas.toDataURL("image/png");
      resolve(dataURL.replace(/^data:image\/(png|jpg);base64,/, ""));
    };
    img.onerror = function () {
      reject("Could not load image");
    };
  });
}

function logError(message) {
  const errorLog = document.getElementById("errorLog");
  errorLog.innerText = message;
}
