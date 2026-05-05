import sys

content = open("ui/src/io/gdelt.ts", "r").read()

content = content.replace("const script = document.createElement('script');\n            script.crossOrigin = 'anonymous';", "const script = document.createElement('script');")

open("ui/src/io/gdelt.ts", "w").write(content)
