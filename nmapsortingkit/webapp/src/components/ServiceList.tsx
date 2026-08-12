import type { NmapService } from "@/utils/nmapParser";

interface ServiceListProps {
  services: NmapService[];
  type: "matched" | "unmatched";
  onServiceSelect: (service: NmapService) => void;
}

const ServiceList = ({ services, type, onServiceSelect }: ServiceListProps) => (
  <div>
    <h2 className="text-lg font-semibold mb-2">
      {type === "matched" ? "Matched" : "Unmatched"} Results ({services.length})
    </h2>
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

export default ServiceList;
