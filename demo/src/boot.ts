export async function onBoot() {
  console.log("[boot] Running demo app boot script...");

  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log("[boot] Demo app initialized");
}
