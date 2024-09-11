chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "fetchImageData") {
      const { imageUrl, apiKey, targetLang } = message;
  
      fetch(imageUrl)
        .then((response) => response.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onloadend = function () {
            const base64Image = reader.result.replace(/^data:.+;base64,/, "");
  
            // ทำ OCR ด้วย Google Vision API
            const requestBody = {
              requests: [
                {
                  image: {
                    content: base64Image,
                  },
                  features: [{ type: "TEXT_DETECTION" }],
                },
              ],
            };
  
            fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
            })
              .then((response) => response.json())
              .then((data) => {
                const textAnnotations = data.responses[0].textAnnotations;
  
                // แปลข้อความด้วย Google Translate API
                const textToTranslate = textAnnotations.map(
                  (annotation) => annotation.description
                ).join("\n");
  
                fetch(
                  `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      q: textToTranslate,
                      target: targetLang,
                    }),
                  }
                )
                  .then((response) => response.json())
                  .then((translationData) => {
                    const translatedAnnotations = textAnnotations.map(
                      (annotation, index) => ({
                        ...annotation,
                        translatedText: translationData.data.translations[index].translatedText,
                      })
                    );
  
                    sendResponse({
                      textAnnotations,
                      translatedAnnotations,
                    });
                  })
                  .catch((error) => {
                    sendResponse({ error: "Translation failed" });
                  });
              })
              .catch((error) => {
                sendResponse({ error: "OCR failed" });
              });
          };
          reader.readAsDataURL(blob);
        })
        .catch((error) => {
          sendResponse({ error: "Failed to fetch image" });
        });
  
      return true; // Keep the message channel open for asynchronous response
    }
  });
  