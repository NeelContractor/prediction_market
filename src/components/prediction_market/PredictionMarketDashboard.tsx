"use client"
import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { MarketType, usePredictionMarketProgram, usePredictionMarketProgramAccount, WinningOutcome } from './prediction_market-data-access';
import { Calendar, TrendingUp, TrendingDown, DollarSign, Users, Clock, CheckCircle, XCircle } from 'lucide-react';
import { ThemeSelect } from '../theme-select';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useTheme } from 'next-themes';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';

const CREATOR_PUB_KEY = new PublicKey("GToMxgF4JcNn8dmNiHt2JrrvLaW6S1zSPoL2W8K2Wkmi");

const CreateMarketModal = ({ isOpen, onClose, onSubmit }: any) => {
    const { theme } = useTheme();
    const [formData, setFormData] = useState({
        question: '',
        endDate: '',
        marketType: 'manual',
        resolutionSource: '',
        initialLiquidity: 100,
        oracleThreshold: 75
    });

    const handleSubmit = () => {
        const endTimestamp = new Date(formData.endDate).getTime() / 1000;
        onSubmit({
            question: formData.question,
            endTimestamp,
            marketType: formData.marketType === 'manual' ? { manual: {} } : { oracle: {} },
            resolutionSource: new PublicKey(formData.resolutionSource),
            initialLiquidity: formData.initialLiquidity,
            oracleThreshold: formData.marketType === 'oracle' ? formData.oracleThreshold : undefined
        });
        onClose();
        setFormData({
            question: '',
            endDate: '',
            marketType: 'manual',
            resolutionSource: '',
            initialLiquidity: 100,
            oracleThreshold: 75
        });
    };

    if (!isOpen) return null;

    return (
        <div className={`fixed inset-0 ${theme == "dark" ? "bg-black text-white" : "bg-white text-black" } bg-opacity-50 flex items-center justify-center z-50`}>
            <div className="rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Create New Market</h2>
                <div className="space-y-4">
                    <div>
                        <Label className="block text-sm font-medium mb-1">Question</Label>
                        <Input
                            type="text"
                            value={formData.question}
                            onChange={(e) => setFormData({...formData, question: e.target.value})}
                            className="w-full border rounded-lg px-3 py-2"
                            required
                        />
                    </div>
                    
                    <div>
                        <Label className="block text-sm font-medium mb-1">End Date</Label>
                        <Input
                            type="datetime-local"
                            value={formData.endDate}
                            onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                            className="w-full border rounded-lg px-3 py-2"
                            required
                        />
                    </div>

                    <div>
                        <Label className="block text-sm font-medium mb-1">Market Type</Label>
                        <Select onValueChange={(value) => setFormData({ ...formData, marketType: value })}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="resolution" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="manual">Manual Resolution</SelectItem>
                                <SelectItem value="oracle">Oracle Resolution</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label className="block text-sm font-medium mb-1">Resolution Source (Public Key)</Label>
                        <Input
                            type="text"
                            value={formData.resolutionSource}
                            onChange={(e) => setFormData({...formData, resolutionSource: e.target.value})}
                            className="w-full border rounded-lg px-3 py-2"
                            placeholder="Enter public key"
                            required
                        />
                    </div>

                    <div>
                        <Label className="block text-sm font-medium mb-1">Initial Liquidity (USDC)</Label>
                        <Input
                            type="number"
                            value={formData.initialLiquidity}
                            onChange={(e) => setFormData({...formData, initialLiquidity: Number(e.target.value)})}
                            className="w-full border rounded-lg px-3 py-2"
                            min="1"
                            required
                        />
                    </div>

                    {formData.marketType === 'oracle' && (
                        <div>
                            <Label className="block text-sm font-medium mb-1">Oracle Threshold (%)</Label>
                            <Input
                                type="number"
                                value={formData.oracleThreshold}
                                onChange={(e) => setFormData({...formData, oracleThreshold: Number(e.target.value)})}
                                className="w-full border rounded-lg px-3 py-2"
                                min="1"
                                max="100"
                            />
                        </div>
                    )}

                    <div className="flex space-x-3">
                        <Button
                            onClick={onClose}
                            className="flex-1  py-2 px-4 rounded-lg"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
                        >
                            Create Market
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Fixed TradeModal
const TradeModal = ({ isOpen, onClose, market, tradeType, onSubmit }: any) => {
    const [formData, setFormData] = useState({
        outcome: 'yes',
        amount: '',
        shares: ''
    });

    const handleSubmit = (e?: any) => {
        e?.preventDefault?.();
        const outcome = formData.outcome === 'yes' ? { yes: {} } : { no: {} };
        
        if (tradeType === 'buy') {
            onSubmit({
                outcome,
                maxCost: Number(formData.amount),
                sharesDesired: Number(formData.shares)
            });
        } else {
            onSubmit({
                outcome,
                sharesToSell: Number(formData.shares),
                minPayout: Number(formData.amount)
            });
        }
        onClose();
        setFormData({ outcome: 'yes', amount: '', shares: '' });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-md">
            <div className=" rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">
                    {tradeType === 'buy' ? 'Buy Shares' : 'Sell Shares'}
                </h2>
                <div className="space-y-4">
                    <div>
                        <Label className="block text-sm font-medium mb-1">Outcome</Label>
                        <Select
                            onValueChange={(value) => setFormData({ ...formData, outcome: value })}
                            >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="outcome" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="yes">Yes</SelectItem>
                                <SelectItem value="no">No</SelectItem>
                            </SelectContent>
                        </Select>

                    </div>

                    <div>
                        <Label className="block text-sm font-medium mb-1">
                            {tradeType === 'buy' ? 'Max Cost (Predict Token)' : 'Min Payout (Predict Token)'}
                        </Label>
                        <Input
                            type="number"
                            value={formData.amount}
                            onChange={(e) => setFormData({...formData, amount: e.target.value})}
                            className="w-full border rounded-lg px-3 py-2"
                            min="0"
                            step="0.01"
                            required
                        />
                    </div>

                    <div>
                        <Label className="block text-sm font-medium mb-1">
                            {tradeType === 'buy' ? 'Shares Desired' : 'Shares to Sell'}
                        </Label>
                        <Input
                            type="number"
                            value={formData.shares}
                            onChange={(e) => setFormData({...formData, shares: e.target.value})}
                            className="w-full border rounded-lg px-3 py-2"
                            min="1"
                            required
                        />
                    </div>

                    <div className="flex space-x-3">
                        <Button
                            onClick={onClose}
                            className="flex-1  py-2 px-4 rounded-lg"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            className={`flex-1 text-white py-2 px-4 rounded-lg ${
                                tradeType === 'buy' 
                                ? 'bg-green-600 hover:bg-green-700' 
                                : 'bg-red-600 hover:bg-red-700'
                            }`}
                        >
                            {tradeType === 'buy' ? 'Buy Shares' : 'Sell Shares'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Fixed ResolveMarketModal - Creator only
const ResolveMarketModal = ({ isOpen, onClose, market, onSubmit }: any) => {
    const { publicKey } = useWallet();
    const [outcome, setOutcome] = useState('yes');

    const handleSubmit = (e: any) => {
        e?.preventDefault?.();
        const winningOutcome = outcome === 'yes' ? { yes: {} } : 
                            outcome === 'no' ? { no: {} } : 
                            outcome === 'canceled' ? { canceled: {} } : { undecided: {} };
        onSubmit({ 
            manualOutcome: winningOutcome,
            resolverPubkey: publicKey
        });
        onClose();
    };

    if (!isOpen || !publicKey) return null;

    return (
        <div className="fixed inset-0  bg-opacity-50 flex items-center justify-center z-50">
            <div className=" rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Resolve Market</h2>
                <div className="space-y-4">
                    <div>
                        <Label className="block text-sm font-medium mb-1">Winning Outcome</Label>
                        <Select
                            onValueChange={(value) => setOutcome(value)}
                            >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="outcome" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="yes">Yes</SelectItem>
                                <SelectItem value="no">No</SelectItem>
                                <SelectItem value="canceled">Canceled</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex space-x-3">
                        <Button
                            onClick={onClose}
                            className="flex-1 py-2 px-4 rounded-lg"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
                        >
                            Resolve Market
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Fixed MarketCard using actual data structure
const MarketCard = ({ market, onTrade, onResolve, onRedeem, userPublicKey }: any) => {
    const { theme } = useTheme();
    const marketData = market.account;
    const marketPubkey = market.publicKey;
    
    // Check if user is creator or resolution source
    const isCreator = userPublicKey && marketData.creator?.equals(userPublicKey);
    const isResolutionSource = userPublicKey && marketData.resolutionSource?.equals(userPublicKey);
    const canResolve = isCreator || isResolutionSource;
    
    // Use actual data structure from your Anchor program
    const isResolved = marketData.resolved || !marketData.winningOutcome?.undecided;
    const endDate = new Date(marketData.endTimestamp.toNumber() * 1000);
    const isExpired = Date.now() > endDate.getTime();
    
    // Calculate prices based on actual outstanding shares
    const yesShares = marketData.yesSharesOutstanding?.toNumber() || 0;
    const noShares = marketData.noSharesOutstanding?.toNumber() || 0;
    const totalShares = yesShares + noShares;
    
    const yesPrice = totalShares > 0 ? (yesShares / totalShares * 100).toFixed(1) : '50.0';
    const noPrice = totalShares > 0 ? (noShares / totalShares * 100).toFixed(1) : '50.0';

    const getOutcomeDisplay = () => {
        if (marketData.winningOutcome?.yes) return { text: 'Yes Won', color: 'text-green-600', icon: CheckCircle };
        if (marketData.winningOutcome?.no) return { text: 'No Won', color: 'text-red-600', icon: XCircle };
        if (marketData.winningOutcome?.canceled) return { text: 'Canceled', color: 'text-gray-600', icon: XCircle };
        return { text: 'Unresolved', color: 'text-yellow-600', icon: Clock };
    };

    const outcomeDisplay = getOutcomeDisplay();
    const OutcomeIcon = outcomeDisplay.icon;

    return (
        <div className={`rounded-lg border p-6 hover:shadow-lg transition-shadow`}>
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold flex-1 mr-4">
                    {marketData.question}
                </h3>
                <div className={`flex items-center space-x-1 ${outcomeDisplay.color}`}>
                    <OutcomeIcon size={16} />
                    <span className="text-sm font-medium">{outcomeDisplay.text}</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
                <div className=" p-3 rounded-lg">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-green-800">YES</span>
                        <TrendingUp className="text-green-600" size={16} />
                    </div>
                    <div className="text-lg font-bold text-green-900">{yesPrice}%</div>
                    <div className="text-xs text-green-600">{yesShares} shares</div>
                </div>

                <div className=" p-3 rounded-lg">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-red-800">NO</span>
                        <TrendingDown className="text-red-600" size={16} />
                    </div>
                    <div className="text-lg font-bold text-red-900">{noPrice}%</div>
                    <div className="text-xs text-red-600">{noShares} shares</div>
                </div>
            </div>

            <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                <div className="flex items-center space-x-1">
                    <Calendar size={14} />
                    <span>Ends: {endDate.toLocaleDateString()}</span>
                </div>
                <div className="flex items-center space-x-1">
                    <DollarSign size={14} />
                    <span>{marketData.totalLiquidity?.toNumber() || 0} USDC</span>
                </div>
            </div>

            <div className="flex space-x-2">
                {!isResolved && !isExpired && (
                    <>
                        <Button
                            onClick={() => onTrade(marketPubkey, 'buy')}
                            className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
                        >
                            Buy
                        </Button>
                        <Button
                            onClick={() => onTrade(marketPubkey, 'sell')}
                            className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
                        >
                            Sell
                        </Button>
                    </>
                )}
                
                {canResolve && !isResolved && isExpired && (
                    <Button
                        onClick={() => onResolve(marketPubkey)}
                        className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
                    >
                        Resolve Market
                    </Button>
                )}

                {isResolved && (
                    <Button
                        onClick={() => onRedeem(marketPubkey)}
                        className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Redeem Winnings
                    </Button>
                )}
            </div>
        </div>
    );
};

// Main Dashboard Component with proper hook usage
const PredictionMarketDashboard = () => {
    const { publicKey, connected } = useWallet();
    const router = useRouter();
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showTradeModal, setShowTradeModal] = useState(false);
    const [showResolveModal, setShowResolveModal] = useState(false);
    const [selectedMarket, setSelectedMarket] = useState<any | null>(null);
    const [tradeType, setTradeType] = useState('buy');

    // Use the main program hook
    const { marketAccounts, createMarketFn } = usePredictionMarketProgram();
    
    // Use the account-specific hook only when we have a selected market
    const { buySharesFn, sellSharesFn, resolveMarketFn, redeemWinningsFn } = usePredictionMarketProgramAccount({
        account: selectedMarket?.publicKey
    });

    const handleCreateMarket = async (marketData: any) => {
        if (!publicKey) return;
        
        try {
            await createMarketFn.mutateAsync({
                ...marketData,
                creatorPubkey: publicKey
            });
        } catch (error) {
            console.error('Failed to create market:', error);
        }
    };

    const handleTrade = (marketPubkey: any, type: any) => {
        const market = marketAccounts.data?.find(m => m.publicKey.equals(marketPubkey));
        if (!market) return;
        
        setSelectedMarket(market);
        setTradeType(type);
        setShowTradeModal(true);
    };

    const handleTradeSubmit = async (tradeData: any) => {
        if (!publicKey || !selectedMarket) return;

        try {
            if (tradeType === 'buy') {
                console.log("Executing buy trade");
                await buySharesFn.mutateAsync({
                    marketPubkey: selectedMarket.publicKey,
                    userPubkey: publicKey,
                    outcome: tradeData.outcome,
                    maxCost: tradeData.maxCost,
                    sharesDesired: tradeData.sharesDesired
                });
            } else if (tradeType === 'sell') {
                console.log("Executing sell trade");
                await sellSharesFn.mutateAsync({
                    marketPubkey: selectedMarket.publicKey,
                    userPubkey: publicKey,
                    outcome: tradeData.outcome,
                    sharesToSell: tradeData.sharesToSell,
                    minPayout: tradeData.minPayout
                });
            }
        } catch (error) {
            console.error('Failed to execute trade:', error);
            toast.error("Failed to execute trade");
        }
    };

    const handleResolve = (marketPubkey: PublicKey) => {
        const market = marketAccounts.data?.find(m => m.publicKey.equals(marketPubkey));
        if (!market) return;
        
        setSelectedMarket(market);
        setShowResolveModal(true);
    };

    const handleResolveSubmit = async (resolveData: any) => {
        if (!selectedMarket || !publicKey) return;

        try {
            await resolveMarketFn.mutateAsync({
                marketPubkey: selectedMarket.publicKey,
                resolverPubkey: publicKey,
                ...resolveData
            });
        } catch (error) {
            console.error('Failed to resolve market:', error);
        }
    };

    const handleRedeem = async (marketPubkey: PublicKey) => {
        if (!publicKey) return;

        try {
            await redeemWinningsFn.mutateAsync({
                marketPubkey,
                amount: 100, // You might want to add a modal to specify amount
                userPubkey: publicKey
            });
        } catch (error) {
            console.error('Failed to redeem winnings:', error);
        }
    };

    // Check if user is creator
    const isCreator = publicKey?.equals(CREATOR_PUB_KEY);

    return (
        <div className="min-h-screen">
            <div className="shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <h1 className="text-2xl font-bold">Prediction Markets</h1>
                        <div className="flex items-center space-x-4">
                            <ThemeSelect />
                            <Button
                                onClick={() => router.push("/buy")}
                            >
                                Buy Predict Tokens
                            </Button>
                            {isCreator && connected && (
                                <Button
                                    onClick={() => setShowCreateModal(true)}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    Create Market
                                </Button>
                            )}
                            <WalletMultiButton />
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {!connected ? (
                    <div className="text-center py-12">
                        <Users className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">Connect your wallet</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            Connect your Solana wallet to start trading prediction markets.
                        </p>
                    </div>
                ) : marketAccounts.isLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-4 text-sm text-gray-500">Loading markets...</p>
                    </div>
                ) : marketAccounts.data?.length === 0 ? (
                    <div className="text-center py-12">
                        <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium ">No markets yet</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            {isCreator ? "Create the first prediction market to get started." : "No prediction markets available yet."}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {marketAccounts.data?.map((market) => (
                            <MarketCard
                                key={market.publicKey.toString()}
                                market={market}
                                onTrade={handleTrade}
                                onResolve={handleResolve}
                                onRedeem={handleRedeem}
                                userPublicKey={publicKey}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Only show create modal to creators */}
            {isCreator && (
                <CreateMarketModal
                    isOpen={showCreateModal}
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={handleCreateMarket}
                />
            )}
            {isCreator && (
                <ResolveMarketModal
                    isOpen={showResolveModal}
                    onClose={() => setShowResolveModal(false)}
                    market={selectedMarket}
                    onSubmit={handleResolveSubmit}
                />
            )}

            <TradeModal
                isOpen={showTradeModal}
                onClose={() => setShowTradeModal(false)}
                market={selectedMarket}
                tradeType={tradeType}
                onSubmit={handleTradeSubmit}
            />

        </div>
    );
};

export default PredictionMarketDashboard;

// "use client"
// import React, { useState } from 'react';
// import { PublicKey } from '@solana/web3.js';
// import { useWallet } from '@solana/wallet-adapter-react';
// import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
// import { MarketType, usePredictionMarketProgram, usePredictionMarketProgramAccount, WinningOutcome } from './prediction_market-data-access';
// import { Calendar, TrendingUp, TrendingDown, DollarSign, Users, Clock, CheckCircle, XCircle } from 'lucide-react';
// import { ThemeSelect } from '../theme-select';
// import { useRouter } from 'next/navigation';
// import { Button } from '../ui/button';
// import { Input } from '../ui/input';
// import { useTheme } from 'next-themes';
// import { Label } from '../ui/label';
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
// import { toast } from 'sonner';

// const CREATOR_PUB_KEY = new PublicKey("GToMxgF4JcNn8dmNiHt2JrrvLaW6S1zSPoL2W8K2Wkmi");

// // ... (CreateMarketModal component remains the same)
// const CreateMarketModal = ({ isOpen, onClose, onSubmit }: any) => {
//     const { theme } = useTheme();
//     const [formData, setFormData] = useState({
//         question: '',
//         endDate: '',
//         marketType: 'manual',
//         resolutionSource: '',
//         initialLiquidity: 100,
//         oracleThreshold: 75
//     });

//     const handleSubmit = () => {
//         const endTimestamp = new Date(formData.endDate).getTime() / 1000;
//         onSubmit({
//             question: formData.question,
//             endTimestamp,
//             marketType: formData.marketType === 'manual' ? { manual: {} } : { oracle: {} },
//             resolutionSource: new PublicKey(formData.resolutionSource),
//             initialLiquidity: formData.initialLiquidity,
//             oracleThreshold: formData.marketType === 'oracle' ? formData.oracleThreshold : undefined
//         });
//         onClose();
//         setFormData({
//             question: '',
//             endDate: '',
//             marketType: 'manual',
//             resolutionSource: '',
//             initialLiquidity: 100,
//             oracleThreshold: 75
//         });
//     };

//     if (!isOpen) return null;

//     return (
//         <div className={`fixed inset-0 ${theme == "dark" ? "bg-black text-white" : "bg-white text-black" } bg-opacity-50 flex items-center justify-center z-50`}>
//             <div className="rounded-lg p-6 w-full max-w-md">
//                 <h2 className="text-xl font-bold mb-4">Create New Market</h2>
//                 <div className="space-y-4">
//                     <div>
//                         <Label className="block text-sm font-medium mb-1">Question</Label>
//                         <Input
//                             type="text"
//                             value={formData.question}
//                             onChange={(e) => setFormData({...formData, question: e.target.value})}
//                             className="w-full border rounded-lg px-3 py-2"
//                             required
//                         />
//                     </div>
                    
//                     <div>
//                         <Label className="block text-sm font-medium mb-1">End Date</Label>
//                         <Input
//                             type="datetime-local"
//                             value={formData.endDate}
//                             onChange={(e) => setFormData({...formData, endDate: e.target.value})}
//                             className="w-full border rounded-lg px-3 py-2"
//                             required
//                         />
//                     </div>

//                     <div>
//                         <Label className="block text-sm font-medium mb-1">Market Type</Label>
//                         {/* <select
//                             value={formData.marketType}
//                             onChange={(e) => setFormData({...formData, marketType: e.target.value})}
//                             className="w-full border rounded-lg px-3 py-2"
//                         >
//                             <option value="manual">Manual Resolution</option>
//                             <option value="oracle">Oracle Resolution</option>
//                         </select> */}
//                         <Select onValueChange={(value) => setFormData({ ...formData, marketType: value })}>
//                             <SelectTrigger className="w-[180px]">
//                                 <SelectValue placeholder="resolution" />
//                             </SelectTrigger>
//                             <SelectContent>
//                                 <SelectItem value="manual">Manual Resolution</SelectItem>
//                                 <SelectItem value="oracle">Oracle Resolution</SelectItem>
//                             </SelectContent>
//                         </Select>
//                     </div>

//                     <div>
//                         <Label className="block text-sm font-medium mb-1">Resolution Source (Public Key)</Label>
//                         <Input
//                             type="text"
//                             value={formData.resolutionSource}
//                             onChange={(e) => setFormData({...formData, resolutionSource: e.target.value})}
//                             className="w-full border rounded-lg px-3 py-2"
//                             placeholder="Enter public key"
//                             required
//                         />
//                     </div>

//                     <div>
//                         <Label className="block text-sm font-medium mb-1">Initial Liquidity (USDC)</Label>
//                         <Input
//                             type="number"
//                             value={formData.initialLiquidity}
//                             onChange={(e) => setFormData({...formData, initialLiquidity: Number(e.target.value)})}
//                             className="w-full border rounded-lg px-3 py-2"
//                             min="1"
//                             required
//                         />
//                     </div>

//                     {formData.marketType === 'oracle' && (
//                         <div>
//                             <Label className="block text-sm font-medium mb-1">Oracle Threshold (%)</Label>
//                             <Input
//                                 type="number"
//                                 value={formData.oracleThreshold}
//                                 onChange={(e) => setFormData({...formData, oracleThreshold: Number(e.target.value)})}
//                                 className="w-full border rounded-lg px-3 py-2"
//                                 min="1"
//                                 max="100"
//                             />
//                         </div>
//                     )}

//                     <div className="flex space-x-3">
//                         <Button
//                             onClick={onClose}
//                             className="flex-1  py-2 px-4 rounded-lg"
//                         >
//                             Cancel
//                         </Button>
//                         <Button
//                             onClick={handleSubmit}
//                             className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
//                         >
//                             Create Market
//                         </Button>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };

// // Fixed TradeModal
// const TradeModal = ({ isOpen, onClose, market, tradeType, onSubmit }: any) => {
//     const [formData, setFormData] = useState({
//         outcome: 'yes',
//         amount: '',
//         shares: ''
//     });
//     // const [buyOutcome, setBuyOutcome] = useState<boolean>(true);

//     const handleSubmit = (e?: any) => {
//         e?.preventDefault?.();
//         const outcome = formData.outcome === 'yes' ? { yes: {} } : { no: {} };
        
//         if (tradeType === 'buy') {
//             onSubmit({
//                 outcome,
//                 maxCost: Number(formData.amount),
//                 sharesDesired: Number(formData.shares)
//             });
//         } else {
//             onSubmit({
//                 outcome,
//                 sharesToSell: Number(formData.shares),
//                 minPayout: Number(formData.amount)
//             });
//         }
//         onClose();
//         setFormData({ outcome: 'yes', amount: '', shares: '' });
//     };

//     if (!isOpen) return null;

//     return (
//         <div className="fixed inset-0 bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-md">
//             <div className=" rounded-lg p-6 w-full max-w-md">
//                 <h2 className="text-xl font-bold mb-4">
//                     {tradeType === 'buy' ? 'Buy Shares' : 'Sell Shares'}
//                 </h2>
//                 <div className="space-y-4">
//                     <div>
//                         <Label className="block text-sm font-medium mb-1">Outcome</Label>
//                         {/* <select
//                             value={formData.outcome}
//                             onChange={(e) => setFormData({...formData, outcome: e.target.value})}
//                             className="w-full border rounded-lg px-3 py-2"
//                         >
//                             <option value="yes">Yes</option>
//                             <option value="no">No</option>
//                         </select> */}
//                         <Select
//                             onValueChange={(value) => setFormData({ ...formData, outcome: value })}
//                             >
//                             <SelectTrigger className="w-[180px]">
//                                 <SelectValue placeholder="outcome" />
//                             </SelectTrigger>
//                             <SelectContent>
//                                 <SelectItem value="yes">Yes</SelectItem>
//                                 <SelectItem value="no">No</SelectItem>
//                             </SelectContent>
//                         </Select>

//                     </div>

//                     <div>
//                         <Label className="block text-sm font-medium mb-1">
//                             {tradeType === 'buy' ? 'Max Cost (Predict Token)' : 'Min Payout (Predict Token)'}
//                         </Label>
//                         <Input
//                             type="number"
//                             value={formData.amount}
//                             onChange={(e) => setFormData({...formData, amount: e.target.value})}
//                             className="w-full border rounded-lg px-3 py-2"
//                             min="0"
//                             step="0.01"
//                             required
//                         />
//                     </div>

//                     <div>
//                         <Label className="block text-sm font-medium mb-1">
//                             {tradeType === 'buy' ? 'Shares Desired' : 'Shares to Sell'}
//                         </Label>
//                         <Input
//                             type="number"
//                             value={formData.shares}
//                             onChange={(e) => setFormData({...formData, shares: e.target.value})}
//                             className="w-full border rounded-lg px-3 py-2"
//                             min="1"
//                             required
//                         />
//                     </div>

//                     <div className="flex space-x-3">
//                         <Button
//                             onClick={onClose}
//                             className="flex-1  py-2 px-4 rounded-lg"
//                         >
//                             Cancel
//                         </Button>
//                         <Button
//                             onClick={handleSubmit}
//                             className={`flex-1 text-white py-2 px-4 rounded-lg ${
//                                 tradeType === 'buy' 
//                                 ? 'bg-green-600 hover:bg-green-700' 
//                                 : 'bg-red-600 hover:bg-red-700'
//                             }`}
//                         >
//                             {tradeType === 'buy' ? 'Buy Shares' : 'Sell Shares'}
//                         </Button>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };

// // Fixed ResolveMarketModal - Creator only
// const ResolveMarketModal = ({ isOpen, onClose, market, onSubmit }: any) => {
//     const { publicKey } = useWallet();
//     const [outcome, setOutcome] = useState('yes');

//     const handleSubmit = (e: any) => {
//         e?.preventDefault?.();
//         const winningOutcome = outcome === 'yes' ? { yes: {} } : 
//                             outcome === 'no' ? { no: {} } : 
//                             outcome === 'canceled' ? { canceled: {} } : { undecided: {} };
//         onSubmit({ 
//             manualOutcome: winningOutcome,
//             resolverPubkey: publicKey
//         });
//         onClose();
//     };

//     if (!isOpen || !publicKey) return null;

//     return (
//         <div className="fixed inset-0  bg-opacity-50 flex items-center justify-center z-50">
//             <div className=" rounded-lg p-6 w-full max-w-md">
//                 <h2 className="text-xl font-bold mb-4">Resolve Market</h2>
//                 <div className="space-y-4">
//                     <div>
//                         <Label className="block text-sm font-medium mb-1">Winning Outcome</Label>
//                         {/* <select
//                             value={outcome}
//                             onChange={(e) => setOutcome(e.target.value)}
//                             className="w-full border rounded-lg px-3 py-2"
//                         >
//                             <option value="yes">Yes</option>
//                             <option value="no">No</option>
//                             <option value="canceled">Canceled</option>
//                         </select> */}
//                         <Select
//                             onValueChange={(value) => setOutcome(value)}
//                             >
//                             <SelectTrigger className="w-[180px]">
//                                 <SelectValue placeholder="outcome" />
//                             </SelectTrigger>
//                             <SelectContent>
//                                 <SelectItem value="yes">Yes</SelectItem>
//                                 <SelectItem value="no">No</SelectItem>
//                                 <SelectItem value="canceled">Canceled</SelectItem>
//                             </SelectContent>
//                         </Select>
//                     </div>

//                     <div className="flex space-x-3">
//                         <Button
//                             onClick={onClose}
//                             className="flex-1 py-2 px-4 rounded-lg"
//                         >
//                             Cancel
//                         </Button>
//                         <Button
//                             onClick={handleSubmit}
//                             className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
//                         >
//                             Resolve Market
//                         </Button>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };

// // Fixed MarketCard using actual data structure
// const MarketCard = ({ market, onTrade, onResolve, onRedeem, userPublicKey, onSellTrade }: any) => {
//     const { theme } = useTheme();
//     const marketData = market.account;
//     const marketPubkey = market.publicKey;
    
//     // Check if user is creator or resolution source
//     const isCreator = userPublicKey && marketData.creator?.equals(userPublicKey);
//     const isResolutionSource = userPublicKey && marketData.resolutionSource?.equals(userPublicKey);
//     const canResolve = isCreator || isResolutionSource;
    
//     // Use actual data structure from your Anchor program
//     const isResolved = marketData.resolved || !marketData.winningOutcome?.undecided;
//     const endDate = new Date(marketData.endTimestamp.toNumber() * 1000);
//     const isExpired = Date.now() > endDate.getTime();
    
//     // Calculate prices based on actual outstanding shares
//     const yesShares = marketData.yesSharesOutstanding?.toNumber() || 0;
//     const noShares = marketData.noSharesOutstanding?.toNumber() || 0;
//     const totalShares = yesShares + noShares;
    
//     const yesPrice = totalShares > 0 ? (yesShares / totalShares * 100).toFixed(1) : '50.0';
//     const noPrice = totalShares > 0 ? (noShares / totalShares * 100).toFixed(1) : '50.0';

//     const getOutcomeDisplay = () => {
//         if (marketData.winningOutcome?.yes) return { text: 'Yes Won', color: 'text-green-600', icon: CheckCircle };
//         if (marketData.winningOutcome?.no) return { text: 'No Won', color: 'text-red-600', icon: XCircle };
//         if (marketData.winningOutcome?.canceled) return { text: 'Canceled', color: 'text-gray-600', icon: XCircle };
//         return { text: 'Unresolved', color: 'text-yellow-600', icon: Clock };
//     };

//     const outcomeDisplay = getOutcomeDisplay();
//     const OutcomeIcon = outcomeDisplay.icon;

//     return (
//         <div className={`rounded-lg border p-6 hover:shadow-lg transition-shadow`}>
//             <div className="flex justify-between items-start mb-4">
//                 <h3 className="text-lg font-semibold flex-1 mr-4">
//                     {marketData.question}
//                 </h3>
//                 <div className={`flex items-center space-x-1 ${outcomeDisplay.color}`}>
//                     <OutcomeIcon size={16} />
//                     <span className="text-sm font-medium">{outcomeDisplay.text}</span>
//                 </div>
//             </div>

//             <div className="grid grid-cols-2 gap-4 mb-4">
//                 <div className=" p-3 rounded-lg">
//                     <div className="flex items-center justify-between">
//                         <span className="text-sm font-medium text-green-800">YES</span>
//                         <TrendingUp className="text-green-600" size={16} />
//                     </div>
//                     <div className="text-lg font-bold text-green-900">{yesPrice}%</div>
//                     <div className="text-xs text-green-600">{yesShares} shares</div>
//                 </div>

//                 <div className=" p-3 rounded-lg">
//                     <div className="flex items-center justify-between">
//                         <span className="text-sm font-medium text-red-800">NO</span>
//                         <TrendingDown className="text-red-600" size={16} />
//                     </div>
//                     <div className="text-lg font-bold text-red-900">{noPrice}%</div>
//                     <div className="text-xs text-red-600">{noShares} shares</div>
//                 </div>
//             </div>

//             <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
//                 <div className="flex items-center space-x-1">
//                     <Calendar size={14} />
//                     <span>Ends: {endDate.toLocaleDateString()}</span>
//                 </div>
//                 <div className="flex items-center space-x-1">
//                     <DollarSign size={14} />
//                     <span>{marketData.totalLiquidity?.toNumber() || 0} USDC</span>
//                 </div>
//             </div>

//             <div className="flex space-x-2">
//                 {!isResolved && !isExpired && (
//                     <>
//                         <Button
//                             onClick={() => onTrade(marketPubkey, 'buy')}
//                             className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
//                         >
//                             Buy
//                         </Button>
//                         <Button
//                             onClick={() => onTrade(marketPubkey, 'sell')}
//                             className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
//                         >
//                             Sell
//                         </Button>
//                     </>
//                 )}
                
//                 {canResolve && !isResolved && isExpired && (
//                     <Button
//                         onClick={() => onResolve(marketPubkey)}
//                         className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
//                     >
//                         Resolve Market
//                     </Button>
//                 )}

//                 {isResolved && (
//                     <Button
//                         onClick={() => onRedeem(marketPubkey)}
//                         className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
//                     >
//                         Redeem Winnings
//                     </Button>
//                 )}
//             </div>
//         </div>
//     );
// };

// // Main Dashboard Component with proper hook usage
// const PredictionMarketDashboard = () => {
//     const { publicKey, connected } = useWallet();
//     const router = useRouter();
//     const [showCreateModal, setShowCreateModal] = useState(false);
//     const [showTradeModal, setShowTradeModal] = useState(false);
//     const [showResolveModal, setShowResolveModal] = useState(false);
//     const [selectedMarket, setSelectedMarket] = useState<any | null>(null);
//     const [tradeType, setTradeType] = useState('buy');
//     const [buyOutcome, setBuyOutcome] = useState<boolean>(true);
//     const [sellOutcome, setSellOutcome] = useState<boolean>(true);

//     // Use the main program hook
//     const { marketAccounts, createMarketFn } = usePredictionMarketProgram();
    
//     // Use the account-specific hook only when we have a selected market
//     const { buySharesFn, sellSharesFn, resolveMarketFn, redeemWinningsFn } = usePredictionMarketProgramAccount({
//         account: selectedMarket?.publicKey
//     });

//     const handleCreateMarket = async (marketData: any) => {
//         if (!publicKey) return;
        
//         try {
//             await createMarketFn.mutateAsync({
//                 ...marketData,
//                 creatorPubkey: publicKey
//             });
//         } catch (error) {
//             console.error('Failed to create market:', error);
//         }
//     };

//     const handleTrade = (marketPubkey: any, type: any) => {
//         const market = marketAccounts.data?.find(m => m.publicKey.equals(marketPubkey));
//         if (!market) return;
        
//         setSelectedMarket(market);
//         setTradeType(type);
//         setShowTradeModal(true);
//     };

//     const handleTradeSubmit = async (tradeData: any) => {
//         if (!publicKey || !selectedMarket) return;

//         try {
//             if (tradeType === 'buy') {
//                 console.log("Executing buy trade")
//                 await buySharesFn.mutateAsync({
//                     marketPubkey: selectedMarket.publicKey,
//                     userPubkey: publicKey,
//                     outcome: buyOutcome,
//                     ...tradeData
//                 });
//             } else if (tradeType === 'sell') {
//                 console.log("Executing sell trade");
//                 await sellSharesFn.mutateAsync({
//                     marketPubkey: selectedMarket.publicKey,
//                     userPubkey: publicKey,
//                     sharesToSell: , //TODO
//                     minPayout: , //TODO
//                     ...tradeData
//                 });
//             }
//         } catch (error) {
//             console.error('Failed to execute trade:', error);
//             toast.error("Failed to execute trade")
//         }
//     };

//     const handleResolve = (marketPubkey: PublicKey) => {
//         const market = marketAccounts.data?.find(m => m.publicKey.equals(marketPubkey));
//         if (!market) return;
        
//         setSelectedMarket(market);
//         setShowResolveModal(true);
//     };

//     const handleResolveSubmit = async (resolveData: any) => {
//         if (!selectedMarket || !publicKey) return;

//         try {
//             await resolveMarketFn.mutateAsync({
//                 marketPubkey: selectedMarket.publicKey,
//                 resolverPubkey: publicKey,
//                 ...resolveData
//             });
//         } catch (error) {
//             console.error('Failed to resolve market:', error);
//         }
//     };

//     const handleRedeem = async (marketPubkey: PublicKey) => {
//         if (!publicKey) return;

//         try {
//             await redeemWinningsFn.mutateAsync({
//                 marketPubkey,
//                 amount: 100, // You might want to add a modal to specify amount
//                 userPubkey: publicKey
//             });
//         } catch (error) {
//             console.error('Failed to redeem winnings:', error);
//         }
//     };

//     // Check if user is creator
//     const isCreator = publicKey?.equals(CREATOR_PUB_KEY);

//     return (
//         <div className="min-h-screen">
//             <div className="shadow-sm border-b">
//                 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
//                     <div className="flex justify-between items-center py-4">
//                         <h1 className="text-2xl font-bold">Prediction Markets</h1>
//                         <div className="flex items-center space-x-4">
//                             <ThemeSelect />
//                             <Button
//                                 onClick={() => router.push("/buy")}
//                             >
//                                 Buy Predict Tokens
//                             </Button>
//                             {isCreator && connected && (
//                                 <Button
//                                     onClick={() => setShowCreateModal(true)}
//                                     className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
//                                 >
//                                     Create Market
//                                 </Button>
//                             )}
//                             <WalletMultiButton />
//                         </div>
//                     </div>
//                 </div>
//             </div>

//             <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
//                 {!connected ? (
//                     <div className="text-center py-12">
//                         <Users className="mx-auto h-12 w-12 text-gray-400" />
//                         <h3 className="mt-2 text-sm font-medium text-gray-900">Connect your wallet</h3>
//                         <p className="mt-1 text-sm text-gray-500">
//                             Connect your Solana wallet to start trading prediction markets.
//                         </p>
//                     </div>
//                 ) : marketAccounts.isLoading ? (
//                     <div className="text-center py-12">
//                         <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
//                         <p className="mt-4 text-sm text-gray-500">Loading markets...</p>
//                     </div>
//                 ) : marketAccounts.data?.length === 0 ? (
//                     <div className="text-center py-12">
//                         <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
//                         <h3 className="mt-2 text-sm font-medium ">No markets yet</h3>
//                         <p className="mt-1 text-sm text-gray-500">
//                             {isCreator ? "Create the first prediction market to get started." : "No prediction markets available yet."}
//                         </p>
//                     </div>
//                 ) : (
//                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
//                         {marketAccounts.data?.map((market) => (
//                             <MarketCard
//                                 key={market.publicKey.toString()}
//                                 market={market}
//                                 onTrade={handleTrade}
//                                 // onSellTrade={handleSellTrade}
//                                 onResolve={handleResolve}
//                                 onRedeem={handleRedeem}
//                                 userPublicKey={publicKey}
//                             />
//                         ))}
//                     </div>
//                 )}
//             </div>

//             {/* Only show create modal to creators */}
//             {isCreator && (
//                 <CreateMarketModal
//                     isOpen={showCreateModal}
//                     onClose={() => setShowCreateModal(false)}
//                     onSubmit={handleCreateMarket}
//                 />
//             )}
//             {isCreator && (
//                 <ResolveMarketModal
//                     isOpen={showResolveModal}
//                     onClose={() => setShowResolveModal(false)}
//                     market={selectedMarket}
//                     onSubmit={handleResolveSubmit}
//                 />
//             )}

//             <TradeModal
//                 isOpen={showTradeModal}
//                 onClose={() => setShowTradeModal(false)}
//                 market={selectedMarket}
//                 tradeType={tradeType}
//                 onSubmit={handleTradeSubmit}
//             />

//         </div>
//     );
// };

// export default PredictionMarketDashboard;