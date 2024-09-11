// ดึง URL ของภาพจากหน้าเว็บ
function extractImageUrlsFromPage(className) {
    const images = document.querySelectorAll(`.${className}`);
    return Array.from(images).map(img => img.src);
  }
  
  // อัปเดตภาพพร้อมคำแปล
  function updateImageWithTranslatedText(imageUrl, textAnnotations) {
    const img = document.querySelector(`img[src="${imageUrl}"]`);
  
    if (!img) return;
  
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
  
    for (const annotation of textAnnotations) {
      const translatedText = annotation.description; // คำแปล
      const vertices = annotation.boundingPoly.vertices;
  
      const fontSize = vertices[3].y - vertices[0].y;
      ctx.font = `${fontSize}px Arial`;
      ctx.fillStyle = 'white';
      ctx.fillText(translatedText, vertices[0].x, vertices[3].y);
      ctx.strokeText(translatedText, vertices[0].x, vertices[3].y);
    }
  
    img.src = canvas.toDataURL('image/png');
  }
  