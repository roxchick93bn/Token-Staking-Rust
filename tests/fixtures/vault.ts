import * as anchor from "@project-serum/anchor";
import { XTokenStake } from "../../target/types/x_token_stake";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  TransactionSignature,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import { Mint } from "./mint";
import { getRewardAddress, getUserAddress, spawnMoney } from "./lib";

export class Vault {
  constructor(
    public program: anchor.Program<XTokenStake>,
    public key: PublicKey,
    public mint: PublicKey,
    public mintAccount: PublicKey,
    public mintCount: number,
    public rewardDuration: number
  ) {}

  async fetch(): Promise<VaultData | null> {
    return (await this.program.account.vault.fetchNullable(
      this.key
    )) as VaultData | null;
  }

  async fetchUser(userAddress: PublicKey): Promise<UserData | null> {
    return (await this.program.account.user.fetchNullable(
      userAddress
    )) as UserData | null;
  }

  static async create({
    authority = Keypair.generate(),
    vaultKey = Keypair.generate(),
    program,
    mint,
    duration,
    stakeTokenCount,
  }: {
    authority?: Keypair;
    vaultKey?: Keypair;
    program: anchor.Program<XTokenStake>;
    mint: Mint;
    duration: number;
    stakeTokenCount: number;
  }): Promise<{
    authority: Keypair;
    vault: Vault;
    sig: TransactionSignature;
  }> {
    await spawnMoney(program, authority.publicKey, 10);

    const [reward, rewardBump] = await getRewardAddress(
      vaultKey.publicKey,
      program
    );

    const mintAccount = await mint.getAssociatedTokenAddress(reward);

    const txSignature = await program.rpc.createVault(
      rewardBump,
      new anchor.BN(duration),
      stakeTokenCount,
      {
        accounts: {
          authority: authority.publicKey,
          vault: vaultKey.publicKey,
          reward,
          rewardMint: mint.key,
          rewardAccount: mintAccount,
          rent: SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedToken: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        },
        signers: [authority, vaultKey],
        options: {
          commitment: "confirmed",
        },
      }
    );
    return {
      authority,
      vault: new Vault(
        program,
        vaultKey.publicKey,
        mint.key,
        mintAccount,
        stakeTokenCount,
        duration
      ),
      sig: txSignature,
    };
  }

  async addFunder(
    authority: Keypair,
    funder = Keypair.generate()
  ): Promise<{
    funderAdded: Keypair;
    sig: TransactionSignature;
  }> {
    const txSignature = await this.program.rpc.authorizeFunder(
      funder.publicKey,
      {
        accounts: {
          authority: authority.publicKey,
          vault: this.key,
        },
        signers: [authority],
        options: {
          commitment: "confirmed",
        },
      }
    );
    return {
      funderAdded: funder,
      sig: txSignature,
    };
  }

  async removeFunder(
    authority: Keypair,
    funder: PublicKey
  ): Promise<{
    sig: TransactionSignature;
  }> {
    const txSignature = await this.program.rpc.unauthorizeFunder(funder, {
      accounts: {
        authority: authority.publicKey,
        vault: this.key,
      },
      signers: [authority],
      options: {
        commitment: "confirmed",
      },
    });
    return {
      sig: txSignature,
    };
  }

  async fund({
    authority,
    funder,
    funderAccount,
    amount,
  }: {
    authority: Keypair;
    funder: Keypair;
    funderAccount: PublicKey;
    amount: anchor.BN;
  }): Promise<{
    sig: TransactionSignature;
  }> {
    const txSignature = await this.program.rpc.fund(amount, {
      accounts: {
        funder: funder.publicKey,
        authority: authority.publicKey,
        vault: this.key,
        rewardAccount: this.mintAccount,
        funderAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [funder],
      options: {
        commitment: "confirmed",
      },
    });
    return {
      sig: txSignature,
    };
  }

  async createUser(authority = Keypair.generate()): Promise<{
    authority: Keypair;
    user: PublicKey;
    sig: TransactionSignature;
  }> {
    await spawnMoney(this.program, authority.publicKey, 10);
    const [userAddress, userBump] = await getUserAddress(
      this.key,
      authority.publicKey,
      this.program
    );

    const txSignature = await this.program.rpc.createUser(userBump, {
      accounts: {
        authority: authority.publicKey,
        vault: this.key,
        user: userAddress,
        systemProgram: SystemProgram.programId,
      },
      signers: [authority],
      options: {
        commitment: "confirmed",
      },
    });

    return {
      authority,
      user: userAddress,
      sig: txSignature,
    };
  }
}

export type VaultStatus = {
  none?: {};
  initialized?: {};
  paused?: {};
};

type VaultData = {
  authority: PublicKey;
  status: VaultStatus;
  rewardMint: PublicKey;
  rewardSeed: number;
  rewardMintAccount: PublicKey;
  rewardDuration: anchor.BN;
  rewardDurationDeadline: anchor.BN;
  rewardRate: anchor.BN;
  stakedCount: number;
  stakeTokenCount: number;
  userCount: number;
  funders: PublicKey[];
};

type UserData = {
  vault: PublicKey;
  key: PublicKey;
  rewardEarnedClaimed: anchor.BN;
  rewardEarnedPending: anchor.BN;
  minStakedCount: number;
  mintAccounts: PublicKey[];
};
