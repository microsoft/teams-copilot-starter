export async function getTickerQuote(req: any, res: any) {
  const ticker = req.params.ticker;

  // Generate a random quote for the ticker.
  const randomQuote = (Math.random() * (200 - 10) + 10).toFixed(2);
  const quote = {
    ticker: ticker,
    quote: randomQuote,
  };
  res.send(quote);
}
