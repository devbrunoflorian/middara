import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:3000/api/translations?limit=5000';
const OUT_DIR = path.resolve(__dirname, '../data/translations/pt-BR');

async function exportTranslations() {
  console.log(`Fetching translations from ${API_URL}...`);
  try {
    const res = await fetch(API_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    const docs = json.docs || [];

    if (docs.length === 0) {
      console.log("No translations found in database.");
      return;
    }

    // Group by page number
    // We expect spanKey or unitId to contain "page_X"
    const pageMap = new Map<number, any[]>();

    for (const doc of docs) {
      const key = doc.unitId || doc.spanKey || "";
      const match = key.match(/page_(\d+)/);
      const pageNum = match ? parseInt(match[1], 10) : 0; // 0 for global or unknown

      if (!pageMap.has(pageNum)) {
        pageMap.set(pageNum, []);
      }
      
      // Clean metadata we don't need in version control
      const cleanDoc = {
        unitId: doc.unitId || doc.spanKey,
        language: doc.language,
        data: doc.data || doc.runs,
        sourceHash: doc.sourceHash,
        updatedAt: doc.updatedAt
      };
      
      pageMap.get(pageNum)!.push(cleanDoc);
    }

    // Write files
    fs.mkdirSync(OUT_DIR, { recursive: true });

    for (const [pageNum, items] of pageMap.entries()) {
      const pageStr = pageNum.toString().padStart(3, '0');
      const filename = `page_${pageStr}.json`;
      const filepath = path.join(OUT_DIR, filename);

      fs.writeFileSync(filepath, JSON.stringify(items, null, 2), 'utf-8');
      console.log(`Saved ${items.length} translations to ${filename}`);
    }

    console.log("Export complete!");
  } catch (error) {
    console.error("Export failed:", error);
  }
}

exportTranslations();
