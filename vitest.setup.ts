import { DOMParser } from "@xmldom/xmldom"

if (!("DOMParser" in globalThis)) {
  ;(globalThis as typeof globalThis & { DOMParser: typeof DOMParser }).DOMParser = DOMParser
}
