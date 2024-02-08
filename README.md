# To Get Started

### Usage

1. `npm install` or yarn
2. Write code in `index.js`
3. `npm run start`



# Lab

### 0. Prereqs 
Get starter branch

```bash
git clone github.com:Unboxed-Software/solana-lab-token22-metadata.git
cd solana-lab-token22-metadata
npm install
npm run start
```

### 1. Helper Functions

copy this into `src/nft-helpers.ts`
```ts
import { Connection, Keypair } from "@solana/web3.js";
import { bundlrStorage, keypairIdentity, Metaplex, toMetaplexFile } from '@metaplex-foundation/js';
import fs from 'fs';

export interface CreateNFTInputs {
    payer: Keypair;
    connection: Connection;
    tokenName: string;
    tokenSymbol: string;
    tokenUri: string;
  }
  
export interface UploadOffChainMetadataInputs {
    connection: Connection;
    payer: Keypair;
    tokenName: string;
    tokenSymbol: string;
    tokenDescription: string;
    imagePath: string;
  }
  
  export async function uploadOffChainMetadata (inputs: UploadOffChainMetadataInputs){
    const { connection, payer, tokenName, tokenDescription, tokenSymbol, imagePath } = inputs;
  
    //TODO make note
    // We are using metaplex API's to upload our metadata and images
    // however this is not necessary, you can use any storage provider you want
    // Metaplex is doing nothing special here, you just need to host the files somewhere and
    // have a uri pointing to the metadata file
    // if you're interested into learning a different one, look at SHDW drive
    const metaplex = Metaplex.make(connection)
      .use(keypairIdentity(payer))
      .use(
        bundlrStorage({
          address: 'https://devnet.bundlr.network',
          providerUrl: 'https://api.devnet.solana.com',
          timeout: 60000,
        }),
      );
  
    // file to buffer
    const buffer = fs.readFileSync('src/' + imagePath);
  
    // buffer to metaplex file
    const file = toMetaplexFile(buffer, imagePath);
  
    // upload image and get image uri
    const imageUri = await metaplex.storage().upload(file);
    console.log('image uri:', imageUri);
  
    // upload metadata and get metadata uri (off chain metadata)
    const { uri } = await metaplex
      .nfts()
      .uploadMetadata({
        name: tokenName,
        description: tokenDescription,
        symbol: tokenSymbol,
        image: imageUri,
      })
      .run();
  
    return uri;
  };
  
```

### 2. Uploading NFT Metadata

copy and paste into `src/index.ts`
```ts
import { Connection, clusterApiUrl } from "@solana/web3.js";
import createNFTWithEmbeddedMetadata from "./embedded-metadata";
import { getKeypairFromFile } from "@solana-developers/helpers";
import { uploadOffChainMetadata } from "./nft-helpers";
import createNFTWithMetadataPointer from "./metadata-with-pointer";

async function main() {


  const connection = new Connection(clusterApiUrl('devnet'), 'finalized');
  // TODO explain the new library
  //TODO potentially create keypair in .env
  //TODO look at this for an .env file
  const payer = await getKeypairFromFile('~/.config/solana/id.json');

  const imagePath = 'cat.jpg';
  const tokenName = 'Cat NFT';
  const tokenDescription = 'This is a cat'
  const tokenSymbol = 'EMB';

  const tokenUri = await uploadOffChainMetadata({
    connection,
    payer,
    tokenName,
    tokenDescription,
    tokenSymbol,
    imagePath,
  });


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


```