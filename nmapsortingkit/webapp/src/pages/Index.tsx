import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import NmapInput from "@/components/NmapInput";
import ServiceList from "@/components/ServiceList";
import ServiceDetails from "@/components/ServiceDetails";
import ThemeToggle from "@/components/ThemeToggle";
import { useToast } from "@/hooks/use-toast";
import {
  aiExtractVersions,
  processNmapResults,
  type NmapService,
  type ProcessedResults,
} from "@/utils/nmapParser";

const Index = () => {
  const [nmapInput, setNmapInput] = useState("");
  const [searchString, setSearchString] = useState("");
  const [results, setResults] = useState<ProcessedResults>({
    matched: [],
    unmatched: [],
  });
  const [selectedMatched, setSelectedMatched] = useState<NmapService | null>(
    null
  );
  const [selectedUnmatched, setSelectedUnmatched] =
    useState<NmapService | null>(null);
  const [isAILoading, setIsAILoading] = useState(false);
  const { toast } = useToast();

  const handleProcess = () => {
    try {
      const processed = processNmapResults(nmapInput, searchString);
      setResults(processed);
      toast({
        title: "Processing complete",
        description: `Found ${processed.matched.length} matched and ${processed.unmatched.length} unmatched results`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "An error occurred while processing results",
        variant: "destructive",
      });
    }
  };

  const handleAIExtractVersions = async () => {
    try {
      setIsAILoading(true);
      const extractedSearch = await aiExtractVersions(nmapInput);
      setSearchString(extractedSearch);
      const processed = processNmapResults(nmapInput, extractedSearch);
      setResults(processed);
      toast({
        title: "Version extraction complete",
        description: `Found ${processed.matched.length} services with version information`,
      });
    } catch (error) {
      toast({
        title: "AI extraction error",
        description:
          error instanceof Error
            ? error.message
            : "An error occurred during version extraction",
        variant: "destructive",
      });
    } finally {
      setIsAILoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <header className="group relative mb-8 text-center">
          <h1 className="mb-3 text-4xl font-extrabold tracking-tight md:text-5xl">
            <ShieldCheck className="mr-3 inline-block h-9 w-9 text-primary transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110" />
            Nmap Result{" "}
            <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
              Sorting
            </span>{" "}
            Kit
          </h1>
          <p className="text-lg text-muted-foreground">
            Sort and search Nmap scan results by evan{" "}
            <a
              href="https://x.com/evanricafort"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              (@evanricafort)
            </a>
          </p>
          <ThemeToggle />
        </header>

        <div className="mb-8 rounded-xl bg-card p-6 shadow-xl ring-1 ring-border sm:p-8">
          <h3 className="mb-4 border-b border-border pb-2 text-xl font-semibold">
            Input Data
          </h3>
          <NmapInput
            nmapInput={nmapInput}
            searchString={searchString}
            onNmapInputChange={setNmapInput}
            onSearchStringChange={setSearchString}
            onProcess={handleProcess}
            onAIExtractVersions={handleAIExtractVersions}
            isAILoading={isAILoading}
          />
        </div>

        <div className="rounded-xl bg-card p-6 shadow-xl ring-1 ring-border sm:p-8">
          <h3 className="mb-4 border-b border-border pb-2 text-xl font-semibold">
            Results
          </h3>
          <div className="grid grid-cols-1 gap-4">
            <ServiceList
              services={results.matched}
              type="matched"
              onServiceSelect={(service) => {
                setSelectedMatched(service);
                setSelectedUnmatched(null);
              }}
            />
            {selectedMatched && (
              <ServiceDetails
                service={selectedMatched}
                type="matched"
                onClose={() => setSelectedMatched(null)}
              />
            )}
            <ServiceList
              services={results.unmatched}
              type="unmatched"
              onServiceSelect={(service) => {
                setSelectedUnmatched(service);
                setSelectedMatched(null);
              }}
            />
            {selectedUnmatched && (
              <ServiceDetails
                service={selectedUnmatched}
                type="unmatched"
                onClose={() => setSelectedUnmatched(null)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
