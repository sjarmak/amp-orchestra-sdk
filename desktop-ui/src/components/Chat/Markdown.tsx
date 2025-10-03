import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export function Markdown({ content }: { content: string }) {
  return (
    <div className="text-current text-sm whitespace-pre-wrap">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ inline, className, children, ...props }: any) {
            return !inline ? (
              <pre className="bg-muted/40 text-current p-2 rounded border border-border overflow-auto whitespace-pre-wrap my-2">
                <code className="text-current" {...props}>{children}</code>
              </pre>
            ) : (
              <code className="bg-muted/40 text-current px-1 py-0.5 rounded" {...props}>{children}</code>
            )
          },
          p: ({ children }) => <p className="text-current text-sm mb-2 last:mb-0">{children}</p>,
          h1: ({ children }) => <h1 className="text-current text-lg font-semibold mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-current text-base font-semibold mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-current text-sm font-semibold mb-1">{children}</h3>,
          ul: ({ children }) => <ul className="text-current text-sm list-disc list-inside mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="text-current text-sm list-decimal list-inside mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-current text-sm">{children}</li>,
          strong: ({ children }) => <strong className="text-current font-semibold">{children}</strong>,
          em: ({ children }) => <em className="text-current italic">{children}</em>,
          a: ({ href, children }) => <a href={href} className="text-primary underline hover:no-underline">{children}</a>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
