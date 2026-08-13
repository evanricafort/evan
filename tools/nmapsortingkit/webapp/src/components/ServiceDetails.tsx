import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { NmapService } from "@/utils/nmapParser";

interface ServiceDetailsProps {
  service: NmapService | null;
  type: "matched" | "unmatched";
  onClose: () => void;
}

const ServiceDetails = ({ service, type, onClose }: ServiceDetailsProps) => {
  if (!service) return null;

  return (
    <Card className="mt-4 relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2"
        onClick={onClose}
      >
        <X className="h-4 w-4" />
      </Button>
      <CardHeader>
        <CardTitle>
          Details for {service.ip}:{service.port}
        </CardTitle>
        <CardDescription>
          {type === "matched" ? "Matched" : "Unmatched"} result details
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 font-mono text-sm">
        <div>
          <span className="font-semibold">Service:</span> {service.service}
        </div>
        <div>
          <span className="font-semibold">State:</span> {service.state}
        </div>
        <div>
          <span className="font-semibold">Version:</span>{" "}
          {service.version || "N/A"}
        </div>
        {service.scripts.length > 0 && (
          <div>
            <div className="font-semibold mb-1">Scripts:</div>
            <div className="pl-4 space-y-1">
              {service.scripts.map((script, index) => (
                <div key={index} className="whitespace-pre-wrap">
                  {script}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ServiceDetails;
