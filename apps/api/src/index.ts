import express from 'express';
import cors from 'cors';
import { db } from './db';
import { eq } from 'drizzle-orm';
import { pages, blocks, images } from './schema';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/pages/:pageNumber', async (req, res) => {
  const pageNumber = parseInt(req.params.pageNumber);
  try {
    const pageData = await db.query.pages.findFirst({
      where: eq(pages.pageNumber, pageNumber),
      with: {
        blocks: true,
        images: true
      }
    });
    
    if (pageData) {
      res.json(pageData);
    } else {
      res.status(404).json({ error: "Page not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

app.put('/blocks/:id', async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  try {
    await db.update(blocks).set({ content }).where(eq(blocks.id, id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Update failed" });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Middara API running on http://localhost:${PORT}`);
});
