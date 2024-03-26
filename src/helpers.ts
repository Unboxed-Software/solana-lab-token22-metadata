import { Connection, Keypair } from '@solana/web3.js';
import { NFTStorage, File } from 'nft.storage'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv';
dotenv.config();

const NFT_STORAGE_API_KEY = process.env.NFT_STORAGE_API_KEY as string;

export interface CreateNFTInputs {
  payer: Keypair;
  connection: Connection;
  tokenName: string;
  tokenSymbol: string;
  tokenUri: string;
  tokenAdditionalMetadata: Record<string, string>;
}

export interface UploadOffChainMetadataInputs {
  tokenName: string;
  tokenSymbol: string;
  tokenDescription: string;
  tokenExternalUrl: string;
  tokenAdditionalMetadata: Record<string, string>;
  imagePath: string;
}

async function fileFromPath(filePath: string) {
  const content = await fs.promises.readFile(filePath)
  return new File([content], path.basename(filePath))
}

function formatIPFSUrl(url: string) {
  return `https://${url}.ipfs.nftstorage.link`
}

export async function uploadOffChainMetadata(inputs: UploadOffChainMetadataInputs) {
  const { tokenName, tokenSymbol, tokenDescription, tokenExternalUrl, imagePath, tokenAdditionalMetadata } = inputs;
  // load the file from disk
  const image = await fileFromPath(imagePath)

  const nftstorage = new NFTStorage({ token: NFT_STORAGE_API_KEY })

  const imageUrl = await nftstorage.storeBlob(image);

  // NFT Standard Metadata
  const metadata = {
    name: tokenName,
    symbol: tokenSymbol,
    description: tokenDescription,
    external_url: tokenExternalUrl,
    image: formatIPFSUrl(imageUrl),
    attributes: Object.entries(tokenAdditionalMetadata).map(([trait_type, value]) => ({ trait_type, value })),
  }

  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  const jsonUrl = await nftstorage.storeBlob(metadataBlob);

  return formatIPFSUrl(jsonUrl);
}
