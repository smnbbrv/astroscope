import { initSomeModule } from "./server/some-module";


export async function onBoot() {
  console.log("------------------------------");
  console.log("Running demo app boot script...");
  console.log("------------------------------");

  await initSomeModule();

  console.log("------------------------------");
  console.log("Demo app initialized");
  console.log("------------------------------");
}
