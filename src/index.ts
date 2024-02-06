async function main() {
  console.log('To make an NFT with metadata pointer to a metaplex account use `npm run metadata-pointer');
  console.log('To make an NFT with metadata embedded `npm run metadata-embedded');
}

main()
  .then(() => {
    console.log('Finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
