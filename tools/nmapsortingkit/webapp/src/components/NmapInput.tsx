import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface NmapInputProps {
  nmapInput: string;
  searchString: string;
  onNmapInputChange: (value: string) => void;
  onSearchStringChange: (value: string) => void;
  onProcess: () => void;
  onAIExtractVersions: () => void;
  isAILoading?: boolean;
}

const NmapInput = ({
  nmapInput,
  searchString,
  onNmapInputChange,
  onSearchStringChange,
  onProcess,
  onAIExtractVersions,
  isAILoading = false,
}: NmapInputProps) => (
  <div className="space-y-4">
    <div>
      <label className="block text-sm font-medium mb-2">Nmap Results</label>
      <Textarea
        placeholder="Paste your nmap results here..."
        value={nmapInput}
        onChange={(e) => onNmapInputChange(e.target.value)}
        className="min-h-[200px]"
      />
    </div>
    <div>
      <label className="block text-sm font-medium mb-2">Search String</label>
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder='Enter search terms (e.g. "smb" "port:445" or "version:" for version detection)'
          value={searchString}
          onChange={(e) => onSearchStringChange(e.target.value)}
          className="flex-1"
        />
        <Button
          variant="outline"
          onClick={onAIExtractVersions}
          disabled={isAILoading || !nmapInput}
          className="flex items-center gap-1"
        >
          <Sparkles className="h-4 w-4" />
          {isAILoading ? "Analyzing..." : "Extract Versions"}
        </Button>
      </div>
    </div>
    <Button onClick={onProcess} disabled={!nmapInput || !searchString}>
      Process Results
    </Button>
  </div>
);

export default NmapInput;
