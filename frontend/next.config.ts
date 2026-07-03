import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  async rewrites() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://abxzyhgaityhgwbltjwu.supabase.co";
    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8000";
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
    ];
  },
};

export default nextConfig;
