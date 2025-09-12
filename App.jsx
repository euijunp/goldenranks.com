import { useState, useEffect, useRef } from 'react'
import './App.css';

export default function App() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [userName, setUserName] = useState('');
  const [userAmount, setUserAmount] = useState('');
  const [estimatedRank, setEstimatedRank] = useState(null);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [loadingError, setLoadingError] = useState(null);
  const [serverStatus, setServerStatus] = useState('checking');
  const [retryCount, setRetryCount] = useState(0);
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  const [paymentVerificationStatus, setPaymentVerificationStatus] = useState('idle');  
  const [showCopyMessage, setShowCopyMessage] = useState(false);
  const [checkboxError, setCheckboxError] = useState(false);
  const [hoveredAmountIndex, setHoveredAmountIndex] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isScrolling = useRef(false);
  const touchTimer = useRef(null);
  const lastTouchTime = useRef(0);
  const retryTimeout = useRef(null);
  const verificationInterval = useRef(null);
  const formRef = useRef(null);
  const amountInputRef = useRef(null);

  const termsContent = `GoldenRanks Terms of Service
Last updated: September 6, 2030
1. Introduction
These Terms of Service govern your use of the GoldenRanks website.
2. Rankings
The rankings displayed on this website are for entertainment purposes only.
3. User Submissions
By submitting your name to the leaderboard, you agree to these terms.
4. No Warranty
This service is provided "as is" without any warranties of any kind.
5. Limitation of Liability
In no event shall GoldenRanks be liable for any indirect damages.`
  const privacyContent = `GoldenRanks Privacy Policy
Last updated: September 4, 2024
1. Information Collection
We only collect your username when you submit it to the leaderboard.
2. Use of Information
Your username is used solely for display on the leaderboard.
3. Data Retention
User data is stored only in your browser's memory and is not persisted.
4. Third-Party Disclosure
We do not share your information with any third parties.
5. Changes to This Policy
We may update this privacy policy from time to time.`

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString.replace(' ', 'T') + 'Z');
      if (isNaN(date.getTime())) {
        console.error('Invalid date after parsing:', dateString);
        return 'N/A';
      }
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
      console.error('Error formatting date:', error, 'for value:', dateString);
      return 'N/A';
    }
  };

  const loadLeaderboard = () => {
    setLoadingError(null);
    fetch('/api/leaderboard')
      .then(response => {
        if (!response.ok) { throw new Error(`Failed to load leaderboard: ${response.status}`); }
        return response.json();
      })
      .then(data => {
        setLeaderboard(Array.isArray(data) ? data : []);
      })
      .catch(error => {
        console.error('Failed to load leaderboard:', error);
        setLoadingError(error.message);
      });
  };
  
  const checkServerStatus = async () => {
    setLoadingError(null);
    try {
      const response = await fetch('/api/status');

      if (!response.ok && response.status === 503) {
        setServerStatus('initializing');
        setLoadingError('Server is initializing. Please wait...');

        const newRetryCount = retryCount + 1;
        setRetryCount(newRetryCount);

        const retryDelay = Math.min(30000, 2000 * Math.pow(2, newRetryCount));

        clearTimeout(retryTimeout.current);
        retryTimeout.current = setTimeout(() => {
          checkServerStatus();
        }, retryDelay);

        return false;
      }

      if (!response.ok && response.status === 500) {
        setServerStatus('error');
        setLoadingError('Database connection failed. Please try again later.');

        const newRetryCount = retryCount + 1;
        setRetryCount(newRetryCount);

        const retryDelay = Math.min(30000, 2000 * Math.pow(2, newRetryCount));

        clearTimeout(retryTimeout.current);
        retryTimeout.current = setTimeout(() => {
          checkServerStatus();
        }, retryDelay);

        return false;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Server returned non-JSON response');
        setServerStatus('error');
        setLoadingError('Server is not responding correctly. Please try again later.');
        return false;
      }

      const data = await response.json();

      if (response.ok && data.status === 'ok') {
        setServerStatus('ready');
        loadLeaderboard();
        return true;
      } else if (data.status === 'maintenance') {
        setServerStatus('initializing');
        setLoadingError('Server is initializing. Please wait...');

        const newRetryCount = retryCount + 1;
        setRetryCount(newRetryCount);

        const retryDelay = Math.min(30000, 2000 * Math.pow(2, newRetryCount));

        clearTimeout(retryTimeout.current);
        retryTimeout.current = setTimeout(() => {
          checkServerStatus();
        }, retryDelay);

        return false;
      } else {
        setServerStatus('error');
        setLoadingError(data.message || 'Server is not ready');
        return false;
      }
    } catch (error) {
      console.error('Server status check failed:', error);

      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        setServerStatus('error');
        setLoadingError('Server is not responding correctly. Please try again later.');
      } else {
        setServerStatus('error');
        setLoadingError('Cannot connect to server. Please check your network connection.');
      }

      const newRetryCount = retryCount + 1;
      setRetryCount(newRetryCount);

      const retryDelay = Math.min(30000, 2000 * Math.pow(2, newRetryCount));

      clearTimeout(retryTimeout.current);
      retryTimeout.current = setTimeout(() => {
        checkServerStatus();
      }, retryDelay);

      return false;
    }
  };

  useEffect(() => {
    setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    checkServerStatus();
    const timer = setInterval(loadLeaderboard, 30000);
    return () => {
      clearInterval(timer);
      clearTimeout(retryTimeout.current);
      clearInterval(verificationInterval.current);
    };
  }, []);

  useEffect(() => {
    const executeAndVerifyPayment = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const paymentId = urlParams.get('paymentId');
      const payerId = urlParams.get('PayerID');

      if (!paymentId || !payerId) {
        return;
      }

      setPaymentVerificationStatus('verifying');
      const pendingUserJSON = localStorage.getItem('pendingUser');
      if (!pendingUserJSON) {
        setPaymentVerificationStatus('failed');
        return;
      }
      
      const pendingUser = JSON.parse(pendingUserJSON);

      try {
        const executeResponse = await fetch(`/api/execute-payment?paymentId=${paymentId}&PayerID=${payerId}&amount=${pendingUser.amount}`);
        if (!executeResponse.ok) {
          throw new Error('Payment execution failed on server.');
        }

        const executeResult = await executeResponse.json();
        if (!executeResult.success) {
          throw new Error('Payment execution not successful.');
        }

        console.log('Payment executed. Starting verification polling...');

        let attempts = 0;
        const maxAttempts = 15;

        verificationInterval.current = setInterval(async () => {
          attempts++;
          const leaderboardResponse = await fetch('/api/leaderboard');
          const latestLeaderboard = await leaderboardResponse.json();
          const myEntry = latestLeaderboard.find(
            user => user.name === pendingUser.name && user.amount >= pendingUser.amount && user.verified
          );

          if (myEntry) {
            console.log('Verification successful!');
            setLeaderboard(latestLeaderboard);
            setPaymentVerificationStatus('verified');
            clearInterval(verificationInterval.current);
            localStorage.removeItem('pendingUser');
            window.history.replaceState({}, document.title, window.location.pathname);
          } else if (attempts >= maxAttempts) {
            console.log('Verification timed out.');
            clearInterval(verificationInterval.current);
            setPaymentVerificationStatus('failed');
            localStorage.removeItem('pendingUser');
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }, 2000);

      } catch (error) {
        console.error('Verification process error:', error);
        setPaymentVerificationStatus('failed');
        localStorage.removeItem('pendingUser');
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    executeAndVerifyPayment();
  }, []);
  
  const checkDuplicateName = (name) => {
    const existingUser = leaderboard.find(user => user.name === name);
    return existingUser ? existingUser.amount : 0;
  };

  const handleNameChange = (e) => {
    let value = e.target.value;
    if (value.length > 64) {
      value = value.substring(0, 64);
    }
    setUserName(value);
    if (userAmount) {
      setEstimatedRank(estimateRank(value, userAmount));
    }
  };

  const handleAmountChange = (e) => {
    let value = e.target.value;
    value = value.replace(/[^0-9]/g, '');
    if (value && parseInt(value) < 1) {
      value = '1';
    }
    setUserAmount(value);
    if (userName) {
        setEstimatedRank(estimateRank(userName, value));
    }
  };

  const estimateRank = (name, amount) => {
    if (!amount || isNaN(amount) || amount <= 0) return null;
    const intAmount = Math.floor(parseInt(amount));
    
    let totalAmount = intAmount;
    const existingAmount = checkDuplicateName(name);
    if (existingAmount > 0) {
        totalAmount += Math.floor(existingAmount);
    }

    const currentAmounts = leaderboard
        .filter(user => user.name !== name)
        .map(user => Math.floor(user.amount));
        
    let rank = 1;
    for (const amt of currentAmounts) {
      if (totalAmount < amt) rank++;
    }
    return rank;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCheckboxError(false);

    if (!agreeTerms) {
      setCheckboxError(true);
      setTimeout(() => setCheckboxError(false), 900);
      return;
    }

    if (serverStatus !== 'ready') {
      alert('Server is not ready. Please try again later.');
      return;
    }
    if (!userName.trim()) {
      alert('Please enter your name.');
      return;
    }
    const intAmount = parseInt(userAmount);
    if (!userAmount || isNaN(intAmount) || intAmount <= 0) {
      alert('Please enter a valid amount (minimum $1).');
      return;
    }
    try {
      const response = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: userName, amount: intAmount })
      });

      if (!response.ok) { throw new Error('Failed to create payment session'); }
      
      const data = await response.json();
      if (data.approvalUrl) {
        localStorage.setItem('pendingUser', JSON.stringify({ name: userName, amount: intAmount }));
        window.location.href = data.approvalUrl;
      } else {
        alert('Failed to get payment approval URL.');
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('An error occurred during payment processing.');
    }
  };

  const handleTouchStart = (index, e) => {
    if (touchTimer.current) {
      clearTimeout(touchTimer.current);
      touchTimer.current = null;
    }
    lastTouchTime.current = Date.now();
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isScrolling.current = false;
    if (hoveredIndex === index) {
      setHoveredIndex(null);
      return;
    }
    touchTimer.current = setTimeout(() => {
      if (!isScrolling.current && (Date.now() - lastTouchTime.current >= 200)) {
        setHoveredIndex(index);
      }
      touchTimer.current = null;
    }, 200);
  };

  const handleTouchMove = (e) => {
    const threshold = 5;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = Math.abs(currentX - touchStartX.current);
    const diffY = Math.abs(currentY - touchStartY.current);
    if (diffX > threshold || diffY > threshold) {
      isScrolling.current = true;
      if (touchTimer.current) {
        clearTimeout(touchTimer.current);
        touchTimer.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
  };

  const handleShare = () => {
    navigator.clipboard.writeText('https://goldenranks.com');
    setShowCopyMessage(true);
    setTimeout(() => setShowCopyMessage(false), 2000);
  };

  const isRecent = (dateString) => {
    if (!dateString) return false;
    const entryDate = new Date(dateString.replace(' ', 'T') + 'Z');
    const now = new Date();
    const oneHour = 60 * 60 * 1000;
    return (now.getTime() - entryDate.getTime()) < oneHour;
  };
  
  const handlePumpItUpClick = (user) => {
    setShowForm(true);
    setUserName(user.name);
    setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        amountInputRef.current?.focus();
        amountInputRef.current?.select();
    }, 100);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-gray-200 py-12 px-4 font-sans relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none opacity-10 background-grid"></div>
      
      {paymentVerificationStatus === 'verifying' && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-80 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-yellow-500 mb-6"></div>
            <h2 className="text-3xl font-bold text-yellow-400 mb-2">Verifying Your Payment...</h2>
            <p className="text-gray-300">Please wait, this may take a few seconds.</p>
        </div>
      )}
      {paymentVerificationStatus === 'verified' && (
         <div className="fixed inset-0 bg-gray-900 bg-opacity-80 flex flex-col items-center justify-center z-50 backdrop-blur-sm" onClick={() => setPaymentVerificationStatus('idle')}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-green-400 mb-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <h2 className="text-3xl font-bold text-green-400 mb-2">Payment Verified!</h2>
            <p className="text-gray-300">Your contribution is worth its weight in gold! Your spot in the GoldenRanks is secure.</p>
            <p className="mt-4 text-xs text-gray-500">(Click anywhere to close)</p>
        </div>
      )}
      {paymentVerificationStatus === 'failed' && (
         <div className="fixed inset-0 bg-gray-900 bg-opacity-80 flex flex-col items-center justify-center z-50 backdrop-blur-sm" onClick={() => setPaymentVerificationStatus('idle')}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-red-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-3xl font-bold text-red-400 mb-2">Verification Failed</h2>
            <p className="text-gray-300 text-center">We couldn't verify your payment automatically.<br/>Please check the leaderboard in a minute or contact support.</p>
            <p className="mt-4 text-xs text-gray-500">(Click anywhere to close)</p>
        </div>
      )}
      {showCopyMessage && (
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
              <div className="copy-message copy-message-active">
                  Link Copied!
              </div>
          </div>
      )}

      <div className="max-w-3xl mx-auto relative">
        <h1 className="text-5xl font-extrabold text-center mb-2 text-yellow-400 tracking-tight">
          Golden<span className="text-white">Ranks</span>
        </h1>
        {}
        <p className="text-center text-gray-300 text-base mb-8 px-4 font-semibold">Rich? All talk. Go ahead and flex.</p>
        <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700 relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-500"></div>
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4 font-bold border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-gray-300">The Golden Leaderboard</span>
              </div>
              <div className="relative">
                <button
                    onClick={handleShare}
                    className="share-button text-gray-400 hover:text-yellow-400 transition-colors duration-200"
                    aria-label="Copy link"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12s-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                    </svg>
                </button>
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-700">
            {serverStatus === 'checking' ? (
              <div className="px-6 py-8 text-center text-gray-400">
                <div className="flex justify-center mb-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-500"></div>
                </div>
                Checking server status...
              </div>
            ) : serverStatus === 'initializing' ? (
              <div className="px-6 py-8 text-center text-yellow-400">
                <div className="flex justify-center mb-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-500"></div>
                </div>
                Server is initializing...
              </div>
            ) : loadingError ? (
              <div className="px-6 py-8 text-center text-red-400">
                <div className="flex justify-center mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                {loadingError}
                {retryCount < 10 && (
                  <div className="mt-4">
                    <button
                      onClick={loadLeaderboard}
                      className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-4 py-2 rounded font-bold transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400">
                <div className="flex justify-center mb-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-500"></div>
                </div>
                Loading the Golden Circle...
              </div>
            ) : (
              leaderboard.map((user, index) => (
                <div
                  key={user.paypal_transaction_id || index}
                  className={`px-6 py-4 group relative ${
                    index < 10 ? (
                      index === 0 ? 'sparkle-gold' :
                      index === 1 ? 'sparkle-silver' :
                      index === 2 ? 'sparkle-bronze' :
                      'sparkle-highlight'
                    ) : ''
                  } transition-all duration-300 touch-item ${
                    hoveredIndex === index ? 'item-hovered' : ''
                  } ${
                    isRecent(user.created_at) ? 'recent-entry' : ''
                  }`}
                  onMouseEnter={() => !isMobile && setHoveredIndex(index)}
                  onMouseLeave={() => !isMobile && setHoveredIndex(null)}
                  onTouchStart={(e) => handleTouchStart(index, e)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 ${
                    index === 0 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' :
                    index === 1 ? 'bg-gradient-to-r from-gray-300 to-gray-200' :
                    index === 2 ? 'bg-gradient-to-r from-amber-600 to-amber-500' :
                    index < 10 ? 'bg-gradient-to-r from-gray-600 to-gray-500' :
                    'bg-transparent group-hover:bg-gray-700/50'
                  }`}></div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center min-w-0 flex-1">
                      <div className="mr-4 flex items-center justify-center flex-shrink-0">
                        {index === 0 && (
                          <div className="relative top-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none">
                              <path d="M12 3L9 7H6L8 10L7 14H10L12 12L14 14H17L16 10L18 7H15L12 3Z"
                                    stroke="#D4AF37"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"/>
                            </svg>
                            <div className="absolute -inset-1.5 bg-yellow-400/20 rounded-full blur-sm animate-ping"></div>
                          </div>
                        )}
                        {index === 1 && (
                          <div className="relative top-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none">
                              <path d="M12 3L9 7H6L8 10L7 14H10L12 12L14 14H17L16 10L18 7H15L12 3Z"
                                    stroke="#C0C0C0"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                        {index === 2 && (
                          <div className="relative top-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none">
                              <path d="M12 3L9 7H6L8 10L7 14H10L12 12L14 14H17L16 10L18 7H15L12 3Z"
                                    stroke="#CD7F32"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center min-w-0">
                          <span className="font-bold text-gray-300 mr-4">
                            {index + 1}.
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className={`font-bold text-gray-300 block ${
                            hoveredIndex === index ? 'whitespace-pre-wrap break-all text-yellow-300 text-wave' : 'overflow-hidden text-ellipsis whitespace-nowrap'
                            }`}>
                            {user.name}
                            </span>
                            <div className="flex items-center min-w-0 mt-1">
                              {index < 3 && (
                                <div className="mr-2 text-[0.75rem]">
                                    <div className={`rank-badge ${
                                      index === 0 ? 'rank-gold' :
                                      index === 1 ? 'rank-silver' :
                                      'rank-bronze'
                                    }`}>
                                      {index === 0 ? 'GOLD' : index === 1 ? 'SILVER' : 'BRONZE'}
                                    </div>
                                </div>
                              )}
                              {isRecent(user.created_at) && (
                                <div className="mr-2 text-[0.75rem]">
                                  <div className="rank-badge rank-new">
                                    NEW!
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className={`detail-container ${hoveredIndex === index ? 'open' : ''}`}>
                              <div className="text-xs text-gray-300 mt-2">
                                <div className="flex items-center mb-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span className="text-yellow-400 font-medium">
                                    Last updated:
                                  </span>
                                  <span className="ml-1">{formatDate(user.created_at)}</span>
                                  <span className="ml-1">UTC+0</span>
                                </div>
                                {user.verified && user.paypal_transaction_id ? (
                                  <div className="flex items-center text-green-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <span className="font-bold">PayPal Transaction Verified!</span>
                                    <span className="ml-2 text-gray-400 text-xs">
                                        (****{user.paypal_transaction_id.slice(-4)})
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center text-gray-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span>Not Verified!</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div
                      className="flex items-center flex-shrink-0 ml-2 transition-all duration-300 cursor-pointer"
                      onClick={(e) => {
                          e.stopPropagation();
                          handlePumpItUpClick(user);
                      }}
                      onTouchStart={(e) => e.stopPropagation()}
                      onMouseEnter={() => !isMobile && setHoveredAmountIndex(index)}
                      onMouseLeave={() => !isMobile && setHoveredAmountIndex(null)}
                    >
                      <div className={`font-extrabold text-lg transition-colors duration-200 ${
                          (isMobile && hoveredIndex === index) || (!isMobile && hoveredAmountIndex === index) ? 'text-yellow-400' :
                          index < 3 ? 'text-yellow-400' : 'text-gray-300'
                      }`}>
                          { (isMobile && hoveredIndex === index) || (!isMobile && hoveredAmountIndex === index)
                              ? 'Pump it up?' 
                              : `$${Math.floor(user.amount).toLocaleString('en-US')}`
                          }
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-500"></div>
        </div>
        {serverStatus === 'ready' && (
          <button
            onClick={() => {
              setShowForm(!showForm)
              setTimeout(() => {
                  formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 100);
            }}
            className="mt-8 w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-gray-900 font-bold py-4 px-6 rounded-xl text-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-[1.02] transform relative overflow-hidden group"
          >
            <span className="relative z-10 flex flex-col items-center">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-800 to-yellow-900">
                Can't afford to be here?
              </span>
              <span className="text-white font-extrabold tracking-wide text-transparent bg-clip-text intense-pulse">
                Prove us wrong!
              </span>
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-300/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-x-full group-hover:translate-x-full"></div>
          </button>
        )}
        {serverStatus === 'ready' && showForm && (
          <div ref={formRef} className="mt-8 bg-gray-800 p-6 rounded-xl shadow-xl border border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-500"></div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-yellow-300 mb-1">
                  Enter your name:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    id="name"
                    value={userName}
                    onChange={handleNameChange}
                    maxLength={64}
                    className="pl-10 w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-white placeholder-gray-400 transition-all duration-200"
                    placeholder="Your golden name"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-yellow-300 mb-1">
                  Enter your amount:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-yellow-400 font-bold text-lg">$</span>
                  </div>
                  <input
                    ref={amountInputRef}
                    type="text"
                    id="amount"
                    value={userAmount}
                    onChange={handleAmountChange}
                    onBlur={() => {
                      if (userAmount) {
                        setEstimatedRank(estimateRank(userName, userAmount));
                      }
                    }}
                    className="pl-10 w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-white placeholder-gray-400 transition-all duration-200"
                    placeholder="How much gold will you contribute?"
                    min="1"
                    step="1"
                    required
                  />
                </div>
                {estimatedRank !== null && (
                  <div className="mt-3 p-3 bg-gradient-to-r from-gray-700 to-gray-600 rounded-lg border border-yellow-500/20 transition-all duration-300 hover:border-yellow-500/40">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 mt-0.5 mr-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div>
                        {checkDuplicateName(userName) > 0 ? (
                            <p className="text-sm text-gray-200">With this additional amount, you'll be ranked <span className="text-yellow-400 font-bold">#{estimatedRank}</span>!</p>
                        ) : (
                            <p className="text-sm text-gray-200">With this amount, you'll be ranked <span className="text-yellow-400 font-bold">#{estimatedRank}</span>!</p>
                        )}
                        {estimatedRank <= 3 && (
                          <p className="text-sm text-yellow-300 mt-1 flex items-center">
                            <span className="mr-1">🌟</span> You'll be in the Golden Circle!
                          </p>
                        )}
                        {checkDuplicateName(userName) > 0 && (
                          <p className="text-sm text-yellow-300 mt-1 flex items-center">
                            <span className="mr-1">💰</span> This will add to your existing amount of ${Math.floor(checkDuplicateName(userName)).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <button
                type="submit"
                className={`w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-gray-900 font-bold py-3 px-4 rounded-lg text-lg transition-all duration-300 shadow-md relative overflow-hidden group flex flex-col items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${!isMobile ? 'desktop-button' : ''}`}
                disabled={!agreeTerms}
              >
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-800 to-yellow-900 transition-all duration-200 group-hover:-translate-y-1">
                  Golden Entry
                </span>
                <span className={`text-xs text-gray-700 mt-1.5 group-hover:opacity-100 transition-all duration-150 transition-delay-100 ${!isMobile ? 'desktop-payment-info' : ''}`}>
                  Secure payment via PayPal • No hidden fees
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-300/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-x-full group-hover:translate-x-full"></div>
              </button>
              <div className={`pt-2 flex flex-col items-center text-xs text-gray-400 ${checkboxError ? 'checkbox-error-glow' : ''}`}>
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    id="agreeTerms"
                    checked={agreeTerms}
                    onChange={e => setAgreeTerms(e.target.checked)}
                    className="mr-2 h-4 w-4 rounded bg-gray-700 border-gray-600 text-yellow-500 focus:ring-yellow-600"
                    required
                  />
                  <label htmlFor="agreeTerms">
                    I agree to the{' '}
                    <a
                      href="#"
                      onClick={e => {
                        e.preventDefault();
                        setShowTerms(true);
                      }}
                      className="underline hover:text-yellow-300 transition-colors"
                    >
                      Terms of Service
                    </a>
                    {' and '}
                    <a
                      href="#"
                      onClick={e => {
                        e.preventDefault();
                        setShowPrivacy(true);
                      }}
                      className="underline hover:text-yellow-300 transition-colors"
                    >
                      Privacy Policy
                    </a>.
                  </label>
                </div>
              </div>
            </form>
          </div>
        )}
        <div className="mt-10 border-t border-gray-700 pt-5 text-sm">
          <div className="flex justify-between items-center">
            <div className="paypal-logo-container">
              <a href="https://www.paypal.com" target="_blank" rel="noopener noreferrer">
                <img src="/PP.png" alt="PayPal Logo" />
              </a>
            </div>
            <div className="flex-grow text-center">
              <div className="flex justify-center space-x-6">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setShowTerms(true)
                  }}
                  className="text-gray-400 hover:text-yellow-400 transition-colors duration-200 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Terms of Service
                </a>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setShowPrivacy(true)
                  }}
                  className="text-gray-400 hover:text-yellow-400 transition-colors duration-200 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Privacy
                </a>
              </div>
              <div className="mt-2 text-center text-xs text-gray-400">
                Leaderboard is secured and verified by GoldenRanks.com
              </div>
              <div className="mt-2 text-center text-xs text-gray-500">
                © 2025 GoldenRanks.com. All Rights Reserved.
              </div>
            </div>

            <div className="cloudflare-logo-container">
              <a href="https://www.cloudflare.com" target="_blank" rel="noopener noreferrer">
                <img src="/CF.png" alt="Protected by Cloudflare" />
              </a>
            </div>
          </div>
        </div>
      </div>
        <div className={`modal-overlay ${showTerms ? 'visible' : ''}`}>
          <div className={`modal-container ${showTerms ? 'visible' : ''}`}>
              <div className="p-7">
                  <div className="flex flex-col items-center justify-center mb-5 text-center">
                      <div className="bg-yellow-500/10 p-2 rounded-lg mb-3">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                      </div>
                      <h2 className="text-2xl font-bold text-yellow-400">Terms of Service</h2>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300 leading-relaxed">{termsContent}</pre>
                  <div className="mt-6 text-right flex justify-center items-center">
                      <button
                          onClick={() => setShowTerms(false)}
                          className="bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-700 hover:to-gray-600 border border-gray-600 px-5 py-2.5 rounded-lg text-gray-200 font-medium transition-all duration-200 transform hover:scale-[1.03]"
                      >
                          Close
                      </button>
                  </div>
              </div>
          </div>
        </div>
        
        <div className={`modal-overlay ${showPrivacy ? 'visible' : ''}`}>
          <div className={`modal-container ${showPrivacy ? 'visible' : ''}`}>
              <div className="p-7">
                  <div className="flex flex-col items-center justify-center mb-5 text-center">
                      <div className="bg-yellow-500/10 p-2 rounded-lg mb-3">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                      </div>
                      <h2 className="text-2xl font-bold text-yellow-400">Privacy Policy</h2>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300 leading-relaxed">{privacyContent}</pre>
                  <div className="mt-6 text-right flex justify-center items-center">
                      <button
                          onClick={() => setShowPrivacy(false)}
                          className="bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-700 hover:to-gray-600 border border-gray-600 px-5 py-2.5 rounded-lg text-gray-200 font-medium transition-all duration-200 transform hover:scale-[1.03]"
                      >
                          Close
                      </button>
                  </div>
              </div>
          </div>
        </div>
    </main>
  );
}