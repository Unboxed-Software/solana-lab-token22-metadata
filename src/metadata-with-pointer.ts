import * as web3 from '@solana/web3.js';
import {
  clusterApiUrl,
  Connection,
  Keypair,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  AuthorityType,
  createAssociatedTokenAccountInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMintToCheckedInstruction,
  createSetAuthorityInstruction,
  ExtensionType,
  getAccount,
  getAssociatedTokenAddress,
  getMetadataPointerState,
  getMint,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { getKeypairFromFile } from '@solana-developers/helpers';
import { fromWeb3JsKeypair, fromWeb3JsPublicKey, toWeb3JsInstruction } from '@metaplex-foundation/umi-web3js-adapters';
import { bundlrStorage, keypairIdentity, Metaplex, toMetaplexFile } from '@metaplex-foundation/js';
import fs from 'fs';
import {
  Collection,
  CollectionDetails,
  createV1,
  CreateV1InstructionAccounts,
  CreateV1InstructionData,
  Creator,
  fetchMetadata,
  PrintSupply,
  TokenStandard,
  Uses,
} from '@metaplex-foundation/mpl-token-metadata';
import { createSignerFromKeypair, none, percentAmount, PublicKey, signerIdentity, Umi } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { CreateNFTInputs } from './nft-helpers';


interface CreateMetadataAccountOnMetaplexIxsInputs {
  payer: Keypair;
  mint: Keypair;
  umi: Umi;
  tokenName: string,
  tokenSymbol: string,
  tokenUri: string,
}

async function getCreateMetadataAccountOnMetaplexIxs(
  inputs: CreateMetadataAccountOnMetaplexIxsInputs
): Promise<web3.TransactionInstruction[]> {

  const {mint, payer, umi, tokenName, tokenSymbol, tokenUri} = inputs;
  const signer = createSignerFromKeypair(umi, fromWeb3JsKeypair(payer));
  umi.use(signerIdentity(signer, true));

  const onChainData = {
    name: tokenName,
    symbol: tokenSymbol,
    uri: tokenUri,
    sellerFeeBasisPoints: percentAmount(0, 2),
    creators: none<Creator[]>(),
    collection: none<Collection>(),
    uses: none<Uses>(),
  };
  const accounts: CreateV1InstructionAccounts = {
    mint: createSignerFromKeypair(umi, fromWeb3JsKeypair(mint)),
    splTokenProgram: fromWeb3JsPublicKey(TOKEN_2022_PROGRAM_ID),
    payer: signer,
    authority: signer,
    updateAuthority: signer,
  };
  const data: CreateV1InstructionData = {
    ...onChainData,
    isMutable: true,
    discriminator: 0,
    tokenStandard: TokenStandard.Fungible,
    collectionDetails: none<CollectionDetails>(),
    ruleSet: none<PublicKey>(),
    createV1Discriminator: 0,
    primarySaleHappened: true,
    decimals: none<number>(),
    printSupply: none<PrintSupply>(),
  };

  // Explain a bit what this is doing
  return createV1(umi, { ...accounts, ...data })
    .getInstructions()
    .map((ix) => toWeb3JsInstruction(ix));
};

function getMetadataAccountAddressOnMetaplex(mint: Keypair){
  //TODO look for in library
  const METAPLEX_PROGRAM_ID = new web3.PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

  // Metaplex drives the metadata account address (PDA) by using the following three seeds
  const seed1 = Buffer.from('metadata');
  const seed2 = METAPLEX_PROGRAM_ID.toBuffer();
  const seed3 = mint.publicKey.toBuffer();
  const [metadataPDA, _bump] = web3.PublicKey.findProgramAddressSync([seed1, seed2, seed3], METAPLEX_PROGRAM_ID);
  return metadataPDA;
};

interface CreateMintWithMetadataPointerIxsInputs {
  mint: Keypair;
  payer: Keypair;
  connection: web3.Connection;
  decimals: number;
}

async function getCreateMintWithMetadataPointerIxs(inputs: CreateMintWithMetadataPointerIxsInputs): Promise<web3.TransactionInstruction[]> {
  const { mint, payer, connection, decimals } = inputs;
  const metadataPDA = getMetadataAccountAddressOnMetaplex(mint);

  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const createMintAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    lamports,
    newAccountPubkey: mint.publicKey,
    programId: TOKEN_2022_PROGRAM_ID,
    space: mintLen,
  });

  // we will point to the metaplex metadata account, but for now it will not be there, we will have to create it later
  const initMetadataPointerIx = createInitializeMetadataPointerInstruction(
    mint.publicKey,
    null,
    metadataPDA,
    TOKEN_2022_PROGRAM_ID,
  );

  const initMintIx = createInitializeMintInstruction(
    mint.publicKey,
    decimals,
    payer.publicKey,
    payer.publicKey,
    TOKEN_2022_PROGRAM_ID,
  );


  return [ // Explain the ordering
    createMintAccountIx, // Why you ordered it like this
    initMetadataPointerIx,
    initMintIx
  ];
};

export default async function createMetadataPointerNFT(inputs: CreateNFTInputs) {
  const { payer, connection, tokenName, tokenSymbol, tokenUri } = inputs;

  //TODO In lab describe what UMI is.
  const umi = createUmi('https://api.devnet.solana.com');

  const mint = Keypair.generate();


  // I want you to use this:
  //TODO Check balance, if none, airdrop

  // NFT should have 0 decimals
  const decimals = 0;

  const createMintIxs = await getCreateMintWithMetadataPointerIxs({
    payer,
    mint,
    connection,
    decimals,
  });

  const metadataIxs = await getCreateMetadataAccountOnMetaplexIxs({
    payer,
    mint,
    umi,
    tokenName,
    tokenSymbol,
    tokenUri
  });

  // we will need this to mint our NFT to it
  const ata = await getAssociatedTokenAddress(mint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const createATAIx = createAssociatedTokenAccountInstruction(
    payer.publicKey,
    ata,
    payer.publicKey,
    mint.publicKey,
    TOKEN_2022_PROGRAM_ID,
  );

  const mintIx = createMintToCheckedInstruction(
    mint.publicKey,
    ata,
    payer.publicKey,
    // NFTs should have a supply of one
    1,
    decimals,
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );

  // NFTs should have no mint authority so no one can mint any more of the same NFT
  const removeMintAuthorityIx = createSetAuthorityInstruction(
    mint.publicKey,
    payer.publicKey,
    AuthorityType.MintTokens,
    null,
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );

  // Building and confirming the transaction
  const transaction = new Transaction().add(
    ...createMintIxs,
    ...metadataIxs,
    createATAIx,
    mintIx,
    removeMintAuthorityIx,
  );
  const sig = await sendAndConfirmTransaction(connection, transaction, [payer, mint]);

  console.log(`Transaction: https://explorer.solana.com/tx/${sig}?cluster=devnet`);

  // Now we can fetch the account and the mint and look at the details

  // Feting the account
  const accountDetails = await getAccount(connection, ata, 'finalized', TOKEN_2022_PROGRAM_ID);
  console.log('Associate Token Account =====>', accountDetails);

  // Feting the mint
  const mintDetails = await getMint(connection, mint.publicKey, undefined, TOKEN_2022_PROGRAM_ID);
  console.log('Mint =====>', mintDetails);

  // But the mint will not have the metadata by it self, we need to first get the metadata pointer
  const metadataPointerState = getMetadataPointerState(mintDetails);
  console.log('Mint metadata-pointer details =====>', metadataPointerState);

  // Since our metadata are on Metaplex we will fetch the metadata using a helper method from metaplex SDK
  const metadata = await fetchMetadata(umi, fromWeb3JsPublicKey(metadataPointerState!.metadataAddress!));
  console.log('Mint metadata =====>', metadata);

  // And we can even get the off-chain json now
  const offChainMetadata = await fetch(metadata.uri).then((res) => res.json());
  console.log('Mint off-chain metadata =====>', offChainMetadata);
}
