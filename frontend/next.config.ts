import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  /**
   * The invoice OCR pipeline (src/lib/ocr) uses native and wasm modules. They must
   * be loaded from node_modules at runtime rather than bundled: sharp ships
   * platform-specific binaries, and mupdf/tesseract.js load .wasm and
   * .traineddata files by path relative to their own package.
   */
  serverExternalPackages: ["sharp", "mupdf", "tesseract.js"],
  outputFileTracingIncludes: {
    // eng.traineddata is vendored at frontend/tessdata so OCR works offline and
    // inside containers; the standalone build must copy it along.
    "/api/ocr/extract-invoice": ["./tessdata/**"],
  },
  async rewrites() {
    let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://uanazwednpluwllhfzlh.supabase.co";
    supabaseUrl = supabaseUrl.replace(/\/$/, "");
    if (!supabaseUrl.startsWith("http://") && !supabaseUrl.startsWith("https://")) {
      supabaseUrl = `https://${supabaseUrl}`;
    }

    let pythonBackendUrl = process.env.PYTHON_BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:8000";
    pythonBackendUrl = pythonBackendUrl.replace(/\/$/, "");
    if (!pythonBackendUrl.startsWith("http://") && !pythonBackendUrl.startsWith("https://")) {
      pythonBackendUrl = `https://${pythonBackendUrl}`;
    }

    return [
      {
        source: "/supabase-api/:path*",
        destination: `${supabaseUrl}/:path*`,
      },
      {
        source: "/api/transcribe",
        destination: `${pythonBackendUrl}/api/transcribe`,
      },
      {
        source: "/api/ai/chat",
        destination: `${pythonBackendUrl}/api/ai/chat`,
      },
      {
        source: "/api/send-message",
        destination: `${pythonBackendUrl}/api/send-message`,
      },
      {
        source: "/api/qc/analyze",
        destination: `${pythonBackendUrl}/api/qc/analyze`,
      },
      {
        source: "/api/site-inspection",
        destination: `${pythonBackendUrl}/api/site-inspection`,
      },
      {
        source: "/api/users",
        destination: `${pythonBackendUrl}/api/users`,
      },
      {
        source: "/api/users/:id",
        destination: `${pythonBackendUrl}/api/users/:id`,
      },
      {
        source: "/api/procurement/purchase-orders/:id/pdf",
        destination: `${pythonBackendUrl}/api/procurement/purchase-orders/:id/pdf`,
      },
      {
        source: "/api/procurement/purchase-requisitions/:id/pdf",
        destination: `${pythonBackendUrl}/api/procurement/purchase-requisitions/:id/pdf`,
      },
      {
        source: "/api/procurement/grns/:id/pdf",
        destination: `${pythonBackendUrl}/api/procurement/grns/:id/pdf`,
      },
      {
        source: "/api/procurement/material-requests/:id/pdf",
        destination: `${pythonBackendUrl}/api/procurement/material-requests/:id/pdf`,
      },
      {
        source: "/api/procurement/rfqs/:id/pdf",
        destination: `${pythonBackendUrl}/api/procurement/rfqs/:id/pdf`,
      },
      {
        source: "/api/procurement/purchase-bills/:id/pdf",
        destination: `${pythonBackendUrl}/api/procurement/purchase-bills/:id/pdf`,
      },
      {
        source: "/api/ocr/recognize",
        destination: `${pythonBackendUrl}/api/ocr/recognize`,
      },
      {
        source: "/api/ocr/health",
        destination: `${pythonBackendUrl}/api/ocr/health`,
      },
      {
        source: "/api/check-license",
        destination: `${pythonBackendUrl}/api/check-license`,
      },
    ];
  },
};

export default nextConfig;
