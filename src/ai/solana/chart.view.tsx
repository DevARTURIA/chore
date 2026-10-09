import PriceChart from '@/components/price-chart';
import { TIMEFRAME } from '@/types/chart';

function renderChart(result: unknown) {
  const typedResult = result as {
    success: boolean;
    data?: { time: number; value: number }[];
    timeFrame: TIMEFRAME;
    tokenInfo: { symbol: string; address: string };
    error?: string;
  };

  if (!typedResult.success) {
    return <div>Error: {typedResult.error}</div>;
  }

  if (!typedResult.data || typedResult.data.length === 0) {
    return <div>No price history data found</div>;
  }

  return (
    <PriceChart
      data={typedResult.data}
      timeFrame={typedResult.timeFrame}
      tokenInfo={typedResult.tokenInfo}
    />
  );
}

const priceChartTool = {
  displayName: 'Price Chart',
  isCollapsible: true,
  isExpandedByDefault: true,
  render: renderChart,
};

const dexChartTool = {
  displayName: 'DEX Price Chart',
  isCollapsible: true,
  isExpandedByDefault: true,
  render: renderChart,
};

export const chartToolViews = {
  priceChartTool,
  dexChartTool,
};
