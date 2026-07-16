'use client';

// Ссылка с кнопкой «скопировать» (PLAN.md §2). Обе ссылки после создания решения — через неё.
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CopyLink({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard недоступен (нет https / отказ в правах) — ссылку всё равно видно, выделяется руками.
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm leading-none font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <code className="border-border bg-muted/50 flex-1 truncate rounded-lg border px-3 py-2.5 text-xs">
          {url}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleCopy}
          aria-label={copied ? 'Скопировано' : `Скопировать: ${label}`}
          className="size-11 shrink-0"
        >
          {copied ? <Check className="text-primary" /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}
