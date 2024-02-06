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
  getAssociatedTokenAddress,
  getMintLen,
  getTokenMetadata,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { getKeypairFromFile } from '@solana-developers/helpers';
import { fromWeb3JsKeypair, fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import { bundlrStorage, keypairIdentity, Metaplex, toMetaplexFile } from '@metaplex-foundation/js';
import fs from 'fs';
import {
  Collection,
  CollectionDetails,
  createV1,
  CreateV1InstructionAccounts,
  CreateV1InstructionData,
  Creator,
  PrintSupply,
  TokenStandard,
  Uses,
} from '@metaplex-foundation/mpl-token-metadata';
import { createSignerFromKeypair, none, percentAmount, PublicKey, signerIdentity } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import * as bs58 from 'bs58';

const createMetadataAccountOnMetaplex = async ({
  payer,
  connection,
  mint,
}: {
  mint: Keypair;
  payer: Keypair;
  connection: web3.Connection;
}) => {
  const umi = createUmi('https://api.devnet.solana.com');

  const signer = createSignerFromKeypair(umi, fromWeb3JsKeypair(payer));
  umi.use(signerIdentity(signer, true));

  const image = 'cat.jpg';
  const tokenMetadata = {
    name: 'metaplex metadata account',
    symbol: 'MMA',
  };

  // Upload image and make metadata URI using metaplex
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
  const buffer = fs.readFileSync('src/' + image);

  // buffer to metaplex file
  const file = toMetaplexFile(buffer, image);

  // upload image and get image uri
  const imageUri = await metaplex.storage().upload(file);
  console.log('image uri:', imageUri);

  // upload metadata and get metadata uri (off chain metadata)
  const { uri } = await metaplex
    .nfts()
    .uploadMetadata({
      name: tokenMetadata.name,
      description: 'some description could go here',
      image: imageUri,
    })
    .run();

  console.log('metadata uri:', uri);

  const onChainData = {
    ...tokenMetadata,
    uri,
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

  const txId = await createV1(umi, { ...accounts, ...data }).sendAndConfirm(umi);
  return bs58.encode(txId.signature);
};

const removeMintAuthority = async ({
  mint,
  payer,
  connection,
}: {
  mint: Keypair;
  payer: Keypair;
  connection: web3.Connection;
}) => {
  const setMintTokenAuthorityIx = createSetAuthorityInstruction(
    mint.publicKey,
    payer.publicKey,
    AuthorityType.MintTokens,
    null,
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );
  const changeMintAuthorityTransaction = new Transaction().add(setMintTokenAuthorityIx);
  return await sendAndConfirmTransaction(connection, changeMintAuthorityTransaction, [payer]);
};

const getMetadataAccountAddressOnMetaplex = (mint: Keypair) => {
  const METAPLEX_PROGRAM_ID = new web3.PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
  // Metaplex drives the metadata account address (PDA) by using the following three seeds
  const seed1 = Buffer.from('metadata');
  const seed2 = METAPLEX_PROGRAM_ID.toBuffer();
  const seed3 = mint.publicKey.toBuffer();
  const [metadataPDA, _bump] = web3.PublicKey.findProgramAddressSync([seed1, seed2, seed3], METAPLEX_PROGRAM_ID);
  return metadataPDA;
};

const createMintWithMetadataPointer = async ({
  mint,
  payer,
  connection,
}: {
  mint: Keypair;
  payer: Keypair;
  connection: web3.Connection;
}) => {
  const metadataPDA = getMetadataAccountAddressOnMetaplex(mint);

  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  // NFT should have 0 decimals
  const decimals = 0;
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

  // we will need this to mint our NFT to it
  const ata = await getAssociatedTokenAddress(mint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const createATAIx = createAssociatedTokenAccountInstruction(
    payer.publicKey,
    ata,
    payer.publicKey,
    mint.publicKey,
    TOKEN_2022_PROGRAM_ID,
  );

  const mintIX = createMintToCheckedInstruction(
    mint.publicKey,
    ata,
    payer.publicKey,
    // NFTs should have a supply of one
    1,
    decimals,
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );

  const transaction = new Transaction().add(
    createMintAccountIx,
    initMetadataPointerIx,
    initMintIx,
    createATAIx,
    mintIX,
  );
  return await sendAndConfirmTransaction(connection, transaction, [payer, mint]);
};

async function main() {
  const endpoint = clusterApiUrl('devnet');
  const connection = new Connection(endpoint, 'confirmed');

  const mint = Keypair.generate();
  const payer = await getKeypairFromFile('~/.config/solana/id.json');

  const mintSig = await createMintWithMetadataPointer({
    payer,
    mint,
    connection,
  });
  console.log(`Creating mint transaction: https://explorer.solana.com/tx/${mintSig}?cluster=devnet`);

  const metadataSig = await createMetadataAccountOnMetaplex({
    payer,
    mint,
    connection,
  });
  console.log(`Creating metadata account transaction: https://explorer.solana.com/tx/${metadataSig}?cluster=devnet`);

  // NFTs should have no mint authority so no one can mint any more of the same NFT
  const removeMintAuthoritySig = await removeMintAuthority({
    payer,
    mint,
    connection,
  });
  console.log(
    `Removing mint authority transaction: https://explorer.solana.com/tx/${removeMintAuthoritySig}?cluster=devnet`,
  );
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
