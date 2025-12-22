export async function initSomeModule() {
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log('Some module initialized');
}
