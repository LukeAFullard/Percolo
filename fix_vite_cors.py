import sys

content = open("ui/vite.config.ts", "r").read()

content = content.replace("'Cross-Origin-Embedder-Policy': 'require-corp'", "'Cross-Origin-Embedder-Policy': 'credentialless'")

open("ui/vite.config.ts", "w").write(content)
