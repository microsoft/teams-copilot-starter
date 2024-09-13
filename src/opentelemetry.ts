import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
} from "@opentelemetry/sdk-trace-base";

console.log("Create OpenTelemetry Resource");
const resource = Resource.default().merge(
  new Resource({
    [ATTR_SERVICE_NAME]: "TCS",
    [ATTR_SERVICE_VERSION]: "0.1.0",
  }),
);

console.log("Create OpenTelemetry WebTracerProvider");
const provider = new WebTracerProvider({
  resource: resource,
});
const exporter = new ConsoleSpanExporter();
const processor = new BatchSpanProcessor(exporter);
provider.addSpanProcessor(processor);

console.log("Register OpenTelemetry WebTracerProvider");
provider.register();
