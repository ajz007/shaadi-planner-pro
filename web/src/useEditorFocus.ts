import { useLayoutEffect, useRef } from 'react'

export function useEditorFocus(editor: unknown, busy: boolean) {
  const heading = useRef<HTMLHeadingElement>(null)
  const returnTarget = useRef<HTMLButtonElement | null>(null)
  const fallback = useRef<HTMLHeadingElement>(null)

  useLayoutEffect(() => {
    if (editor) heading.current?.focus()
  }, [editor])

  useLayoutEffect(() => {
    if (!editor && !busy && returnTarget.current) {
      const target = returnTarget.current
      returnTarget.current = null
      if (target.isConnected && !target.disabled) target.focus()
      else fallback.current?.focus()
    }
  }, [editor, busy])

  return { heading, returnTarget, fallback }
}
