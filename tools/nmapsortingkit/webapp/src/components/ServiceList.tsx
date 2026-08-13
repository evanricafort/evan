import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { NmapService } from "@/utils/nmapParser";

interface ServiceListProps {
  services: NmapService[];
  type: "matched" | "unmatched";
  onServiceSelect: (service: NmapService) => void;
}

/**
 * Copies text to the clipboard, falling back to a temporary textarea when the
 * async Clipboard API is unavailable (e.g. served over a non-secure origin).
 */
const copyText = async (text: string): Promise<void> => {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  document.body.appendChild(textarea);
  textarea.select();

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);

  if (!ok) throw new Error("Clipboard not available");
};

const ServiceList = ({ services, type, onServiceSelect }: ServiceListProps) => {
  const { toast } = useToast();

  const handleCopy = async () => {
    if (services.length === 0) return;

    const text = services
      .map((service) => `${service.ip}:${service.port}`)
      .join("\n");

    try {
      await copyText(text);
      toast({
        title: "Copied to clipboard",
        description: `Copied ${services.length} ${type} ${
          services.length === 1 ? "entry" : "entries"
        }`,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description:
          error instanceof Error
            ? error.message
            : "Could not access the clipboard",
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {type === "matched" ? "Matched" : "Unmatched"} Results (
          {services.length})
        </h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          disabled={services.length === 0}
          title={`Copy all ${type} IP:PORT to clipboard`}
          className="h-8 shrink-0 px-3 text-[0.8125rem]"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy IP:PORT
        </Button>
      </div>
      <div
        className={`border rounded-lg p-4 ${
          type === "matched"
            ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900"
            : "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900"
        }`}
      >
        {services.length === 0 ? (
          <div className="text-muted-foreground">No {type} results</div>
        ) : (
          <div className="space-y-2">
            {services.map((service, index) => (
              <div
                key={index}
                className="font-mono cursor-pointer hover:text-primary"
                onClick={() => onServiceSelect(service)}
              >
                {service.ip}:{service.port}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceList;
