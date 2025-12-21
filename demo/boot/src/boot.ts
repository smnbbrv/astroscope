import { initSomeModule } from "./server/some-module";

export async function onStartup() {
  console.log("------------------------------");
  console.log("Running demo app startup...");
  console.log("------------------------------");

  await initSomeModule();

  console.log("------------------------------");
  console.log("Demo app initialized");
  console.log("------------------------------");
}

export async function onShutdown() {
  console.log("------------------------------");
  console.log("Demo app shutting down...");
  console.log("------------------------------");
}
