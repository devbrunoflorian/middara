import fs from 'fs';
import path from 'path';
import type { Page, Block, TextContent, ImageContent, Position } from '@middara/schema';

const PAYLOAD_URL = 'http://127.0.0.1:3000/api';
const PAGES_DIR = path.resolve(__dirname, '../../../apps/web/public/pages');

// Simple helper to calculate bounding box for a group of spans/lines
function calculateBoundingBox(elements: any[]): [number, number, number, number] {
  if (elements.length === 0) return [0, 0, 0, 0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (const el of elements) {
    minX = Math.min(minX, el.bbox[0]);
    minY = Math.min(minY, el.bbox[1]);
    maxX = Math.max(maxX, el.bbox[2]);
    maxY = Math.max(maxY, el.bbox[3]);
  }
  return [minX, minY, maxX, maxY];
}

async function ingestPage(pageNumber: number) {
  const pageStr = pageNumber.toString().padStart(3, '0');
  const domPath = path.join(PAGES_DIR, `page_${pageStr}`, `page_${pageStr}_dom.json`);
  
  if (!fs.existsSync(domPath)) {
    console.log(`Skipping Page ${pageNumber}: _dom.json not found`);
    return;
  }

  const rawDom = JSON.parse(fs.readFileSync(domPath, 'utf8'));
  console.log(`Ingesting Page ${pageNumber}...`);

  // 1. Create the Page in Payload
  const pageRes = await fetch(`${PAYLOAD_URL}/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number: pageNumber,
      // For now, hardcode a mock chapter or allow null
      chapter: null,
      version: 1
    })
  });
  
  const pageData = await pageRes.json();
  const pageId = pageData.doc?.id;

  if (!pageId) {
    console.error(`Failed to create page ${pageNumber} in Payload.`);
    console.error(JSON.stringify(pageData, null, 2));
    return;
  }

  // 2. Parse blocks and spans, create RulebookBlocks
  let readingOrder = 0;
  for (const rawBlock of rawDom.blocks) {
    
    // We group by paragraph (block) solving the word-level fragmentation problem!
    if (!rawBlock.lines || rawBlock.lines.length === 0) continue;
    
    const blockBbox = rawBlock.bbox;
    let combinedText = '';
    let mainFont = 'Optima';
    let mainColor: string | undefined = undefined;
    let mainSize = 12;

    for (const line of rawBlock.lines) {
      for (const span of line.spans) {
        let text = span.text;
        
        // Use the first span's styling as the block's base style
        if (span.font.includes('Cinzel')) mainFont = 'Cinzel';
        else if (span.font.includes('Esmeralda')) mainFont = 'Esmeralda';
        else if (span.font.includes('Garamond')) mainFont = 'AGaramond';
        
        mainColor = span.color || mainColor;
        mainSize = span.size || mainSize;

        // Apply Markdown formatting based on font name or flags
        const isItalic = span.font.toLowerCase().includes('italic') || (span.flags & 2);
        const isBold = span.font.toLowerCase().includes('bold') || (span.flags & 16);
        
        if (isBold && isItalic) text = `***${text}***`;
        else if (isBold) text = `**${text}**`;
        else if (isItalic) text = `*${text}*`;

        combinedText += text;
      }
      combinedText += '\n'; // Keep line breaks for fidelity
    }

    const newBlock = {
      page: pageId,
      type: 'text',
      readingOrder: readingOrder++,
      position: {
        x: blockBbox[0],
        y: blockBbox[1],
        width: blockBbox[2] - blockBbox[0],
        height: blockBbox[3] - blockBbox[1],
        zIndex: 200 // Default z-index for text
      },
      content: {
        kind: 'text',
        markdown: combinedText.trim(),
        style: {
          fontFamily: mainFont,
          fontSize: mainSize,
          color: mainColor,
          textAlign: 'left' // Further heuristics could detect centered text
        }
      }
    };

    await fetch(`${PAYLOAD_URL}/rulebook-blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBlock)
    });
  }
  
  console.log(`Successfully ingested Page ${pageNumber}`);
}

async function wipeData() {
  console.log("Wiping existing data...");
  const pages = await fetch(`${PAYLOAD_URL}/pages?limit=1000`).then(r => r.json());
  for (const page of pages.docs || []) {
    await fetch(`${PAYLOAD_URL}/pages/${page.id}`, { method: 'DELETE' });
  }
  
  const blocks = await fetch(`${PAYLOAD_URL}/rulebook-blocks?limit=1000`).then(r => r.json());
  for (const block of blocks.docs || []) {
    await fetch(`${PAYLOAD_URL}/rulebook-blocks/${block.id}`, { method: 'DELETE' });
  }
  console.log("Wipe complete!");
}

async function run() {
  console.log("Starting Payload Ingestion Script...");
  await wipeData();
  // Ingesting all 109 pages
  for (let i = 1; i <= 109; i++) {
    await ingestPage(i);
  }
  console.log("Ingestion complete!");
}

run();
