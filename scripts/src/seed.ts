import pg from "pg";

const { Pool } = pg;

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set — skipping seed");
    process.exit(0);
  }

  const pool = new Pool({ connectionString: url });

  try {
    const configCount = await pool.query("SELECT COUNT(*) FROM bot_config");
    if (parseInt(configCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO bot_config (
          network, mode, min_profit_threshold_usd, max_gas_price_gwei,
          slippage_tolerance, flashbots_enabled, flash_loan_enabled,
          flash_loan_provider, strategies, dex_list, token_watchlist,
          max_position_size_usd
        ) VALUES (
          'bsc', 'simulation', 1.00, 5.00, 0.5, false, true,
          'pancakeswap',
          ARRAY['cross_dex', 'triangular'],
          ARRAY['pancakeswap_v2', 'pancakeswap_v3', 'biswap', 'apeswap'],
          ARRAY['WBNB/USDT', 'WBNB/BUSD', 'USDT/BUSD', 'ETH/WBNB', 'CAKE/WBNB'],
          10000.00
        )
      `);
      console.log("✓ Inserted default bot_config");
    } else {
      console.log("✓ bot_config already has data — skipping");
    }

    const stateCount = await pool.query("SELECT COUNT(*) FROM bot_state");
    if (parseInt(stateCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO bot_state (
          running, network, mode, connected_to_node, flashbots_enabled,
          pending_tx_count, block_number, wallet_balance, gas_price
        ) VALUES (
          false, 'bsc', 'simulation', false, false,
          0, 0, '0', '0'
        )
      `);
      console.log("✓ Inserted default bot_state");
    } else {
      console.log("✓ bot_state already has data — skipping");
    }

    console.log("✓ Database seed complete");
  } catch (err: any) {
    if (err?.code === "42P01") {
      console.log("Tables not ready yet — seed skipped (push schema first)");
      process.exit(0);
    }
    throw err;
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
