self.__BUILD_MANIFEST = {
  "__rewrites": {
    "afterFiles": [
      {
        "source": "/supabase-api/:path*"
      },
      {
        "source": "/api/transcribe"
      },
      {
        "source": "/api/send-message"
      },
      {
        "source": "/api/qc/analyze"
      },
      {
        "source": "/api/site-inspection"
      },
      {
        "source": "/api/users"
      },
      {
        "source": "/api/users/:id"
      },
      {
        "source": "/api/procurement/purchase-orders/:id/pdf"
      },
      {
        "source": "/api/procurement/purchase-requisitions/:id/pdf"
      }
    ],
    "beforeFiles": [],
    "fallback": []
  },
  "sortedPages": [
    "/_app",
    "/_error"
  ]
};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()