import express from 'express';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Task management state
interface ScrapingTask {
  id: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  progress: {
    current: number;
    total: number;
    lastPage: number;
    logs: string[];
    startTime: number;
  };
  config: {
    url: string;
    selectors: { name: string, selector: string }[];
    spreadsheetId: string;
    credentials: any;
  };
}

const tasks: Record<string, ScrapingTask> = {};

function getPageUrl(baseUrl: string, pageNum: number) {
  try {
    const urlObj = new URL(baseUrl);
    const pathname = urlObj.pathname;
    
    // Pattern 1: ends with /1, /2, etc.
    if (/\/\d+$/.test(pathname)) {
        urlObj.pathname = pathname.replace(/\/\d+$/, `/${pageNum}`);
        return urlObj.toString();
    }
    
    // Pattern 2: contains /page/1
    if (/\/page\/\d+/i.test(pathname)) {
        urlObj.pathname = pathname.replace(/\/page\/\d+/i, `/page/${pageNum}`);
        return urlObj.toString();
    }

    // Pattern 3: query params (page, p, pg, paging)
    const qParams = ['page', 'p', 'pg', 'paging'];
    for(const p of qParams) {
        if (urlObj.searchParams.has(p)) {
            urlObj.searchParams.set(p, pageNum.toString());
            return urlObj.toString();
        }
    }

    // Default fallback: append ?page=N
    urlObj.searchParams.set('page', pageNum.toString());
    return urlObj.toString();
  } catch (e) {
    return baseUrl;
  }
}

async function runTask(taskId: string) {
  const task = tasks[taskId];
  if (!task) return;

  const { selectors, spreadsheetId, credentials, url } = task.config;
  const startPage = task.status === 'active' ? task.progress.lastPage + 1 : 1; 

  try {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    for (let i = 0; i < task.progress.total; i++) {
      if (tasks[taskId]?.status === 'cancelled') {
        task.progress.logs.unshift(`[${new Date().toLocaleTimeString()}] Task cancelled by user.`);
        break;
      }

      const currentPageNum = startPage + i;
      const targetUrl = getPageUrl(url, currentPageNum);
      
      task.progress.current = i + 1;
      task.progress.lastPage = currentPageNum;
      task.progress.logs.unshift(`[${new Date().toLocaleTimeString()}] Scraping Page ${currentPageNum}...`);

      try {
        // 1. Fetch
        const response = await axios.get(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.google.com/'
          },
          timeout: 30000,
          family: 4 // MEMAKSA IPv4 - Solusi utama ETIMEDOUT di Linux
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        const scrapeResult: any = {};
        
        let foundSomethingAtAll = false;
        
        for (const item of selectors) {
          try {
            const elements = $(item.selector);
            if (elements.length > 0) {
              foundSomethingAtAll = true;
              if (elements.length > 1) {
                const vals = elements.map((j, el) => $(el).text().trim()).get().filter(v => v !== "");
                scrapeResult[item.name] = vals;
                task.progress.logs.unshift(`[DATA] Found ${vals.length} items for "${item.name}"`);
              } else {
                const val = elements.first().text().trim();
                scrapeResult[item.name] = val;
                if (val) task.progress.logs.unshift(`[DATA] Found text for "${item.name}": ${val.substring(0, 40)}...`);
              }
            } else {
              scrapeResult[item.name] = ""; 
              task.progress.logs.unshift(`[WARN] Selector "${item.selector}" matched 0 elements on this page.`);
            }
          } catch (selectorErr: any) {
            const errMsg = `Selector syntax error for "${item.name}": ${selectorErr.message}`;
            task.progress.logs.unshift(`[${new Date().toLocaleTimeString()}] ${errMsg}`);
            scrapeResult[item.name] = "";
          }
        }

        if (!foundSomethingAtAll) {
          task.progress.logs.unshift(`[DEBUG] HTML Snippet (First 500 chars): ${html.substring(0, 500).replace(/\n/g, ' ')}...`);
          // Also look for common structures
          const bodyClasses = $('body').attr('class') || 'none';
          task.progress.logs.unshift(`[DEBUG] Body Classes: ${bodyClasses}`);
          const divCount = $('div').length;
          task.progress.logs.unshift(`[DEBUG] Total DIV tags: ${divCount}`);
        }

        // 2. Prepare rows
        const keys = Object.keys(scrapeResult);
        const rows: any[][] = [];
        
        // Find maximum length of arrays to determine row count
        let maxRows = 1;
        keys.forEach(k => {
          if (Array.isArray(scrapeResult[k])) {
            maxRows = Math.max(maxRows, scrapeResult[k].length);
          }
        });

        // Filter out empty results to see if we have anything to write
        const hasAnyData = keys.some(k => {
          const val = scrapeResult[k];
          return Array.isArray(val) ? val.length > 0 : val !== "";
        });

        if (hasAnyData) {
          for (let j = 0; j < maxRows; j++) {
            const row = keys.map(key => {
              const val = scrapeResult[key];
              if (Array.isArray(val)) {
                return val[j] || ""; // Distribute array values
              }
              return val; // Repeat scalars
            });
            rows.push(row);
          }
        }

        // 3. Append to Google Sheets
        if (rows.length > 0) {
          try {
            await sheets.spreadsheets.values.append({
              spreadsheetId,
              range: 'A1', // More generic range
              valueInputOption: 'USER_ENTERED',
              insertDataOption: 'INSERT_ROWS',
              requestBody: { values: rows },
            });
            task.progress.logs.unshift(`[${new Date().toLocaleTimeString()}] Page ${currentPageNum} SUCCESS: ${rows.length} rows synced to Sheets.`);
          } catch (sheetErr: any) {
            const sheetErrMsg = `Google Sheets API Error: ${sheetErr.message}`;
            task.progress.logs.unshift(`[${new Date().toLocaleTimeString()}] ${sheetErrMsg}`);
            console.error(sheetErrMsg, sheetErr);
          }
        } else {
          task.progress.logs.unshift(`[${new Date().toLocaleTimeString()}] Page ${currentPageNum}: No valid data found to sync.`);
        }
      } catch (err: any) {
        task.progress.logs.unshift(`[${new Date().toLocaleTimeString()}] ERROR on Page ${currentPageNum}: ${err.message}`);
        // Continue to next page or fail? Let's continue for now but mark log
      }

      // Small delay
      await new Promise(r => setTimeout(r, 1000));
    }

    if (task.status !== 'cancelled') {
      task.status = 'completed';
      task.progress.logs.unshift(`[${new Date().toLocaleTimeString()}] ALL PAGES COMPLETED.`);
    }
  } catch (error: any) {
    console.error('Task engine error:', error);
    task.status = 'failed';
    task.progress.logs.unshift(`[${new Date().toLocaleTimeString()}] FATAL CRASH: ${error.message}`);
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 8000;

  app.use(express.json({ limit: '10mb' }));
  app.use(cors());

  // Task Endpoints
  app.post('/api/tasks', (req, res) => {
    const { url, selectors, spreadsheetId, credentials, totalPages } = req.body;
    const id = Math.random().toString(36).substring(2, 9);
    
    tasks[id] = {
      id,
      status: 'active',
      progress: {
        current: 0,
        total: totalPages || 1,
        lastPage: 0,
        logs: [`[${new Date().toLocaleTimeString()}] Task initialized. Target: ${url}`],
        startTime: Date.now()
      },
      config: {
        url,
        selectors,
        spreadsheetId,
        credentials: JSON.parse(credentials)
      }
    };

    runTask(id); // Background execution
    res.json({ id });
  });

  app.get('/api/tasks', (req, res) => {
    res.json(Object.values(tasks));
  });

  app.get('/api/tasks/:id', (req, res) => {
    const task = tasks[req.params.id];
    if (!task) return res.status(404).send('Task not found');
    res.json(task);
  });

  app.post('/api/tasks/:id/cancel', (req, res) => {
    const task = tasks[req.params.id];
    if (task) task.status = 'cancelled';
    res.json({ success: true });
  });

  app.delete('/api/tasks/:id', (req, res) => {
    delete tasks[req.params.id];
    res.json({ success: true });
  });

  // API Route: Proxy website for selection
  app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).send('URL is required');
    }

    try {
      const response = await axios.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 30000,
        family: 4 // MEMAKSA IPv4 - Solusi utama ETIMEDOUT di Linux
      });

      const $ = cheerio.load(response.data);
      const baseUrl = new URL(targetUrl);

      // Remove existing scripts to prevent lag and conflicts
      $('script').remove();
      
      // Add <base> tag to handle all relative URLs automatically and efficiently
      $('head').prepend(`<base href="${baseUrl.origin}${baseUrl.pathname}">`);

      // Inject Selection Logic using attributes instead of classes to avoid selector pollution
      const selectionLogic = `
        <style>
          [data-ais-hover="true"] { 
            outline: 2px solid #6366f1 !important; 
            outline-offset: -2px !important;
            cursor: crosshair !important; 
            background-color: rgba(99, 102, 241, 0.05) !important;
          }
        </style>
        <script>
          (function() {
            let lastElement = null;

            document.addEventListener('mouseover', (e) => {
              if (lastElement) {
                lastElement.removeAttribute('data-ais-hover');
              }
              const target = e.target.closest('*');
              if (target && target !== document.body && target !== document.documentElement) {
                target.setAttribute('data-ais-hover', 'true');
                lastElement = target;
              }
            });

            document.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              
              const element = e.target;
              const selector = getSelector(element, false);
              const listSelector = getSelector(element, true);
              
              window.parent.postMessage({
                type: 'ELEMENT_SELECTED',
                selector: selector,
                listSelector: listSelector,
                text: (element.innerText || element.textContent || '').substring(0, 100).trim()
              }, '*');
            }, true);

            function getSelector(el, isList = false) {
              if (el.id && /^[a-zA-Z_]/.test(el.id)) {
                return '#' + el.id;
              }
              
              const getCleanClasses = (node) => {
                if (!node || !node.className || typeof node.className !== 'string') return [];
                return node.className.split(/\s+/)
                  .filter(c => c && /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(c) && !c.includes('hover') && !c.includes('ais'));
              };

              // Heuristic: Try to find a good class-based selector by going up a few levels
              let current = el;
              let parts = [];
              let depth = 0;
              const maxDepth = 4;

              while (current && current.tagName && current.tagName !== 'HTML' && depth < maxDepth) {
                let nodeName = current.tagName.toLowerCase();
                let classes = getCleanClasses(current);
                let part = nodeName;

                if (classes.length > 0) {
                  // If we find a class that looks specific, we might be able to stop
                  part += '.' + classes.join('.');
                  
                  // In List mode, if we find a class on the element itself or immediate parent, it's often the repeating class
                  if (isList && depth <= 1) {
                    // Test if this class alone is enough
                    const selector = '.' + classes[0];
                    const matches = document.querySelectorAll(selector);
                    if (matches.length > 1) return selector;
                  }
                }

                if (!isList) {
                  const siblings = current.parentElement ? Array.from(current.parentElement.children).filter(s => s.tagName === current.tagName) : [];
                  if (siblings.length > 1) {
                    part += \`:nth-of-type(\${siblings.indexOf(current) + 1})\`;
                  }
                }

                parts.unshift(part);
                if (current.id && /^[a-zA-Z_]/.test(current.id) && !isList) {
                  parts[0] = '#' + current.id;
                  break;
                }
                
                current = current.parentElement;
                depth++;
              }

              return parts.join(' '); // Use descendant selector instead of direct child for more flexibility
            }
          })();
        </script>
      `;

      $('body').append(selectionLogic);

      res.send($.html());
    } catch (error) {
      console.error('Proxy error:', error);
      res.status(500).send('Failed to proxy website');
    }
  });

  // API Route: Scrape data
  app.post('/api/scrape', async (req, res) => {
    const { url, selectors } = req.body;
    if (!url || !selectors || !Array.isArray(selectors)) {
      return res.status(400).json({ error: 'URL and selectors array are required' });
    }

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const $ = cheerio.load(response.data);
      
      const results: any = {};
      selectors.forEach((item: { name: string, selector: string }) => {
        const elements = $(item.selector);
        if (elements.length > 1) {
          // If multiple elements found, return as an array (or join them)
          results[item.name] = elements.map((i, el) => $(el).text().trim()).get();
        } else {
          results[item.name] = elements.first().text().trim();
        }
      });

      res.json(results);
    } catch (error) {
      console.error('Scrape error:', error);
      res.status(500).json({ error: 'Failed to scrape data' });
    }
  });

  // API Route: Append to Sheet
  app.post('/api/sheet/append', async (req, res) => {
    const { spreadsheetId, data, credentials } = req.body;
    
    if (!spreadsheetId || !data || !credentials) {
      return res.status(400).json({ error: 'Spreadsheet ID, data, and credentials are required' });
    }

    try {
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(credentials),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      
      // Handle potential arrays in data (multi-row append)
      const keys = Object.keys(data);
      const rows: any[][] = [];
      
      // Check if any field is an array (multi-row)
      const firstArrayKey = keys.find(k => Array.isArray(data[k]));
      
      if (firstArrayKey) {
        const length = data[firstArrayKey].length;
        for (let i = 0; i < length; i++) {
          const row = keys.map(key => {
            const val = data[key];
            return Array.isArray(val) ? val[i] : val;
          });
          rows.push(row);
        }
      } else {
        rows.push(keys.map(key => data[key]));
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: rows,
        },
      });

      res.json({ success: true, count: rows.length });
    } catch (error) {
      console.error('Google Sheets error:', error);
      res.status(500).json({ error: 'Failed to save to Google Sheets' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
