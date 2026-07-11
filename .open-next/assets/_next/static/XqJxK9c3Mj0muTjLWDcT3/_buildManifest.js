self.__BUILD_MANIFEST = {
  "__rewrites": {
    "afterFiles": [
      {
        "source": "/api/home"
      },
      {
        "source": "/api/details"
      },
      {
        "source": "/api/stream"
      },
      {
        "source": "/api/search"
      },
      {
        "source": "/api/category"
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