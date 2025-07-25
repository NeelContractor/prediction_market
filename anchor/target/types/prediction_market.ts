/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/prediction_market.json`.
 */
export type PredictionMarket = {
  "address": "9rHEF2zsthD6hz6Rt1kNDZAWtoNnSM1rBFYBu5fqSKFQ",
  "metadata": {
    "name": "predictionMarket",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "buyShares",
      "discriminator": [
        40,
        239,
        138,
        154,
        8,
        37,
        106,
        108
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "userCollateralAccount",
          "writable": true
        },
        {
          "name": "userYesTokenAccount",
          "writable": true,
          "optional": true
        },
        {
          "name": "userNoTokenAccount",
          "writable": true,
          "optional": true
        },
        {
          "name": "collateralVault",
          "writable": true
        },
        {
          "name": "yesTokenMint",
          "writable": true
        },
        {
          "name": "noTokenMint",
          "writable": true
        },
        {
          "name": "marketAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": {
            "defined": {
              "name": "shareOutcome"
            }
          }
        },
        {
          "name": "maxCost",
          "type": "u64"
        },
        {
          "name": "sharesDesired",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "signer": true
        },
        {
          "name": "collateralMint"
        },
        {
          "name": "yesTokenMint",
          "writable": true,
          "signer": true
        },
        {
          "name": "noTokenMint",
          "writable": true,
          "signer": true
        },
        {
          "name": "marketAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "collateralVault",
          "writable": true,
          "signer": true
        },
        {
          "name": "creatorCollateralAccount",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "question",
          "type": "string"
        },
        {
          "name": "endTimestamp",
          "type": "i64"
        },
        {
          "name": "marketType",
          "type": {
            "defined": {
              "name": "marketType"
            }
          }
        },
        {
          "name": "resolutionSource",
          "type": "pubkey"
        },
        {
          "name": "initialLiquidity",
          "type": "u64"
        },
        {
          "name": "oracleThreashold",
          "type": {
            "option": "i64"
          }
        }
      ]
    },
    {
      "name": "emergencyResolveMarket",
      "discriminator": [
        130,
        86,
        247,
        104,
        220,
        211,
        253,
        124
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "resolver",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": {
            "defined": {
              "name": "winningOutcome"
            }
          }
        }
      ]
    },
    {
      "name": "getMarketPrice",
      "discriminator": [
        154,
        24,
        145,
        82,
        77,
        84,
        117,
        0
      ],
      "accounts": [
        {
          "name": "market"
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": {
            "defined": {
              "name": "shareOutcome"
            }
          }
        }
      ],
      "returns": "u64"
    },
    {
      "name": "redeemWinnings",
      "discriminator": [
        209,
        5,
        204,
        87,
        134,
        122,
        239,
        185
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "userCollateralAccount",
          "writable": true
        },
        {
          "name": "userWinningTokenAccount",
          "writable": true
        },
        {
          "name": "collateralVault",
          "writable": true
        },
        {
          "name": "winningTokenMint",
          "writable": true
        },
        {
          "name": "marketAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "resolveMarket",
      "discriminator": [
        155,
        23,
        80,
        173,
        46,
        74,
        23,
        239
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "resolutionSource"
        },
        {
          "name": "resolver",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "manualOutcome",
          "type": {
            "option": {
              "defined": {
                "name": "winningOutcome"
              }
            }
          }
        }
      ]
    },
    {
      "name": "sellShares",
      "discriminator": [
        184,
        164,
        169,
        16,
        231,
        158,
        199,
        196
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "userCollateralAccount",
          "writable": true
        },
        {
          "name": "userYesTokenAccount",
          "writable": true
        },
        {
          "name": "userNoTokenAccount",
          "writable": true
        },
        {
          "name": "collateralVault",
          "writable": true
        },
        {
          "name": "yesTokenMint",
          "writable": true
        },
        {
          "name": "noTokenMint",
          "writable": true
        },
        {
          "name": "marketAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": {
            "defined": {
              "name": "shareOutcome"
            }
          }
        },
        {
          "name": "sharesToSell",
          "type": "u64"
        },
        {
          "name": "minPayout",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "marketResolved",
      "msg": "Market has already been resolved."
    },
    {
      "code": 6001,
      "name": "marketNotResolved",
      "msg": "Market has not been resolved yet."
    },
    {
      "code": 6002,
      "name": "marketNotEnd",
      "msg": "Market has not resolved its end time yet."
    },
    {
      "code": 6003,
      "name": "marketAlreadyResolved",
      "msg": "Market is already resolved."
    },
    {
      "code": 6004,
      "name": "invalidOracleFeed",
      "msg": "Invalid oracle feed provided."
    },
    {
      "code": 6005,
      "name": "oraclePriceStale",
      "msg": "Oracle price data is stale or invalid."
    },
    {
      "code": 6006,
      "name": "oracleNotAvailable",
      "msg": "Oracle data not available, grace period no passed."
    },
    {
      "code": 6007,
      "name": "emergencyPeriodNotReached",
      "msg": "Emergency resolution period not reached."
    },
    {
      "code": 6008,
      "name": "zeroAmount",
      "msg": "Amount cannot be zero."
    },
    {
      "code": 6009,
      "name": "invalidTokenMint",
      "msg": "Invalid token mint for redemption."
    },
    {
      "code": 6010,
      "name": "invalidOutcome",
      "msg": "Invalid outcome provided."
    },
    {
      "code": 6011,
      "name": "slippageExceeded",
      "msg": "Slippage tolerance exceeded."
    },
    {
      "code": 6012,
      "name": "mathOverflow",
      "msg": "Math overflow occurred."
    },
    {
      "code": 6013,
      "name": "mathUnderflow",
      "msg": "Math underflow occurred."
    },
    {
      "code": 6014,
      "name": "noLiquidity",
      "msg": "No liquidity available."
    },
    {
      "code": 6015,
      "name": "unauthorizedResolver",
      "msg": "Unauthorized resolver."
    },
    {
      "code": 6016,
      "name": "outcomeRequired",
      "msg": "Outcome reqired for manual resolution."
    },
    {
      "code": 6017,
      "name": "oracleThresholdRequired",
      "msg": "Outcome threshold reqired for oracle markets."
    },
    {
      "code": 6018,
      "name": "invalidTokenAccount",
      "msg": "Invalid Token Account."
    }
  ],
  "types": [
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "question",
            "type": "string"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "marketAuthority",
            "type": "pubkey"
          },
          {
            "name": "collateralVault",
            "type": "pubkey"
          },
          {
            "name": "yesTokenMint",
            "type": "pubkey"
          },
          {
            "name": "noTokenMint",
            "type": "pubkey"
          },
          {
            "name": "endTimestamp",
            "type": "i64"
          },
          {
            "name": "resolutionSource",
            "type": "pubkey"
          },
          {
            "name": "resolved",
            "type": "bool"
          },
          {
            "name": "winningOutcome",
            "type": {
              "defined": {
                "name": "winningOutcome"
              }
            }
          },
          {
            "name": "marketType",
            "type": {
              "defined": {
                "name": "marketType"
              }
            }
          },
          {
            "name": "yesSharesOutstanding",
            "type": "u64"
          },
          {
            "name": "noSharesOutstanding",
            "type": "u64"
          },
          {
            "name": "totalLiquidity",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "oracleThreshold",
            "type": {
              "option": "i64"
            }
          }
        ]
      }
    },
    {
      "name": "marketType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "oracle"
          },
          {
            "name": "manual"
          }
        ]
      }
    },
    {
      "name": "shareOutcome",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "yes"
          },
          {
            "name": "no"
          }
        ]
      }
    },
    {
      "name": "winningOutcome",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "undecided"
          },
          {
            "name": "yes"
          },
          {
            "name": "no"
          },
          {
            "name": "canceled"
          }
        ]
      }
    }
  ]
};
