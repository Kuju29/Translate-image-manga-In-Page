chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "replaceImage") {
    const { imageUrl, canvasDataUrl } = message;
    replaceImagesInBackground(imageUrl, canvasDataUrl);
  }
});

function replaceImagesInBackground(imageUrl, canvasDataUrl) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0 || !tabs[0].id) {
      // console.error("No active tab found or invalid tab id.");
      return;
    }

    const tabId = tabs[0].id;

    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        func: (imageUrl, canvasDataUrl) => {
          const urlsToReplace = new Set([imageUrl]);
          const remainingImages = new Set();

          const batchReplaceImages = (images) => {
            images.forEach((img) => {
              if (
                !img.classList.contains("processed") &&
                (urlsToReplace.has(img.src) ||
                  urlsToReplace.has(img.getAttribute("data-src")))
              ) {
                console.log(
                  `Replacing image: ${img.src || img.getAttribute("data-src")}`
                );
                img.src = canvasDataUrl;
                img.classList.add("processed");

                img.classList.remove("lazyload", "lazyloaded");
                img.loading = "eager";

                const newImg = new Image();
                newImg.src = canvasDataUrl;
                newImg.onload = () => {
                  img.src = newImg.src;
                  console.log(
                    `Image loaded and replaced with new URL: ${canvasDataUrl}`
                  );
                };

                urlsToReplace.delete(imageUrl);
                remainingImages.delete(img);
              }
            });
          };

          const processAvailableImages = () => {
            const images = [...remainingImages];
            batchReplaceImages(images);
            updateRemainingImages();
          };

          const debounce = (func, delay) => {
            let timer;
            return (...args) => {
              clearTimeout(timer);
              timer = setTimeout(() => func(...args), delay);
            };
          };

          const updateRemainingImages = () => {
            document.querySelectorAll("img").forEach((img) => {
              if (!img.classList.contains("processed") && !img.src) {
                remainingImages.add(img);
              } else {
                remainingImages.delete(img);
              }
            });
          };

          const intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                remainingImages.add(entry.target);
                debouncedProcess();
              }
            });
          });

          const mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              if (
                mutation.type === "attributes" &&
                mutation.attributeName === "src"
              ) {
                debouncedProcess();
              }
            });
          });

          const debouncedProcess = debounce(processAvailableImages, 100);

          const startObserving = () => {
            const images = document.querySelectorAll("img");
            images.forEach((img) => {
              intersectionObserver.observe(img);
              mutationObserver.observe(img, {
                attributes: true,
                attributeFilter: ["src"],
              });
            });

            processAvailableImages();
          };

          startObserving();
        },
        args: [imageUrl, canvasDataUrl],
      },
      (result) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error executing script:",
            chrome.runtime.lastError.message
          );
        } else {
          console.log("Script executed successfully:", result);
        }
      }
    );
  });
}
