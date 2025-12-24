/**
 * HWP Conversion API Server
 *
 * Endpoints:
 *   POST /api/convert/json          - HWP → JSON
 *   POST /api/convert/html          - HWP → HTML
 *   POST /api/convert/markdown      - HWP → Markdown
 *   POST /api/convert/body-text     - HWP → body_text with TableSchema
 *   POST /api/convert/table-schemas - HWP → TableSchema[] only
 *   POST /api/info                  - HWP file info (header only)
 *   GET  /health                    - Health check
 */

import { toJson, toHtml, toMarkdown, fileHeader } from '@ohah/hwpjs';
import {
  transformHwpTablesWithSchema,
  extractAllTableSchemas,
} from '@ohah/hwpjs/table-schema';
import type { HwpDocument } from './types';

const PORT = process.env.PORT || 3000;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Response helpers
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// Extract HWP buffer from request
async function getHwpBuffer(req: Request): Promise<Buffer> {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      throw new Error('No file uploaded');
    }
    const arrayBuffer = await file.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (contentType.includes('application/octet-stream')) {
    const arrayBuffer = await req.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error('Unsupported content type. Use multipart/form-data or application/octet-stream');
}

// Request handler
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Health check
  if (path === '/health' && req.method === 'GET') {
    return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
  }

  // API routes
  if (path.startsWith('/api/') && req.method === 'POST') {
    try {
      const hwpBuffer = await getHwpBuffer(req);

      switch (path) {
        case '/api/convert/json': {
          const json = toJson(hwpBuffer);
          const doc: HwpDocument = JSON.parse(json);
          return jsonResponse({
            success: true,
            data: doc,
          });
        }

        case '/api/convert/html': {
          const includeImages = url.searchParams.get('includeImages') !== 'false';
          const html = toHtml(hwpBuffer, {
            includeVersion: true,
            includePageInfo: true,
          });
          return jsonResponse({
            success: true,
            data: { html },
          });
        }

        case '/api/convert/markdown': {
          const imageFormat = url.searchParams.get('imageFormat') || 'base64';
          const result = toMarkdown(hwpBuffer, {
            image: imageFormat,
            useHtml: true,
            includeVersion: true,
          });
          return jsonResponse({
            success: true,
            data: {
              markdown: result.markdown,
              images: result.images.map(img => ({
                id: img.id,
                format: img.format,
                size: img.data.length,
                data: imageFormat === 'base64'
                  ? undefined
                  : Buffer.from(img.data).toString('base64'),
              })),
            },
          });
        }

        case '/api/convert/body-text': {
          const json = toJson(hwpBuffer);
          const parsed = JSON.parse(json);
          if (!parsed.body_text) {
            return errorResponse('No body_text found in HWP document');
          }
          const transformedBodyText = transformHwpTablesWithSchema(parsed.body_text);
          return jsonResponse({
            success: true,
            data: transformedBodyText,
          });
        }

        case '/api/convert/table-schemas': {
          const json = toJson(hwpBuffer);
          const parsed = JSON.parse(json);
          if (!parsed.body_text) {
            return jsonResponse({
              success: true,
              data: [],
            });
          }
          const transformedBodyText = transformHwpTablesWithSchema(parsed.body_text);
          const tableSchemas = extractAllTableSchemas(transformedBodyText);
          return jsonResponse({
            success: true,
            data: tableSchemas,
            count: tableSchemas.length,
          });
        }

        case '/api/info': {
          const headerJson = fileHeader(hwpBuffer);
          const header = JSON.parse(headerJson);
          return jsonResponse({
            success: true,
            data: header,
          });
        }

        default:
          return errorResponse('Not found', 404);
      }
    } catch (e: any) {
      console.error('Error processing request:', e);
      return errorResponse(e.message || 'Internal server error', 500);
    }
  }

  // Not found
  return errorResponse('Not found', 404);
}

// Start server
const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`
🚀 HWP Conversion API Server

  Listening: http://localhost:${server.port}

  Endpoints:
    POST /api/convert/json          - HWP → JSON
    POST /api/convert/html          - HWP → HTML
    POST /api/convert/markdown      - HWP → Markdown
    POST /api/convert/body-text     - HWP → body_text with TableSchema
    POST /api/convert/table-schemas - HWP → TableSchema[] only
    POST /api/info                  - File header info
    GET  /health                    - Health check

  Usage:
    curl -X POST -F "file=@document.hwp" http://localhost:${server.port}/api/convert/json
    curl -X POST -F "file=@document.hwp" http://localhost:${server.port}/api/convert/table-schemas
`);

export type { HwpDocument };
