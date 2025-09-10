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
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isScrolling = useRef(false);
  const touchTimer = useRef(null);
  const lastTouchTime = useRef(0);
  const retryTimeout = useRef(null);
  const termsContent = `GoldenRanks Terms & Conditions
Last updated: September 6, 2030
1. Introduction
These Terms and Conditions govern your use of the GoldenRanks website.
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
      let date;

      if (typeof dateString === 'number') {
        date = new Date(dateString);
      }
      else if (typeof dateString === 'string') {
        if (dateString.includes(' ')) {
          const [datePart, timePart] = dateString.split(' ');
          const formattedDate = datePart + 'T' + timePart;
          date = new Date(formattedDate);
        }
        else {
          date = new Date(dateString);
        }
      }
      else if (dateString instanceof Date) {
        date = dateString;
      }
      else {
        console.error('Unexpected date format:', dateString);
        return 'N/A';
      }

      if (isNaN(date.getTime())) {
        console.error('Invalid date after parsing:', dateString);
        return 'N/A';
      }

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error('Error formatting date:', error, 'for value:', dateString);
      return 'N/A';
    }
  }

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
  }

  const loadLeaderboard = () => {
    setLoadingError(null);
    fetch('/api/leaderboard')
      .then(response => {
        if (!response.ok && response.status === 503) {
          setServerStatus('initializing');
          setLoadingError('Server is initializing. Please wait...');

          const newRetryCount = retryCount + 1;
          setRetryCount(newRetryCount);

          const retryDelay = Math.min(30000, 2000 * Math.pow(2, newRetryCount));

          clearTimeout(retryTimeout.current);
          retryTimeout.current = setTimeout(() => {
            loadLeaderboard();
          }, retryDelay);

          throw new Error(`Failed to load leaderboard: ${response.status}`);
        }

        if (!response.ok && response.status === 500) {
          setServerStatus('error');
          setLoadingError('Database connection failed. Please try again later.');

          const newRetryCount = retryCount + 1;
          setRetryCount(newRetryCount);

          const retryDelay = Math.min(30000, 2000 * Math.pow(2, newRetryCount));

          clearTimeout(retryTimeout.current);
          retryTimeout.current = setTimeout(() => {
            loadLeaderboard();
          }, retryDelay);

          throw new Error(`Failed to load leaderboard: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.error('Server returned non-JSON response for leaderboard request');
          setServerStatus('error');
          setLoadingError('Server is not responding correctly. Please try again later.');
          throw new Error(`Failed to load leaderboard: Invalid response format`);
        }

        if (!response.ok) {
          throw new Error(`Failed to load leaderboard: ${response.status}`);
        }

        return response.json();
      })
      .then(data => {
        if (!Array.isArray(data)) {
          if (data.leaderboard && Array.isArray(data.leaderboard)) {
            setLeaderboard(data.leaderboard);
          } else {
            setLeaderboard([]);
            setLoadingError("Invalid leaderboard data format");
          }
          return;
        }
        setLeaderboard(data);
        setRetryCount(0);
      })
      .catch(error => {
        console.error('Failed to load leaderboard:', error);
        setLoadingError(error.message);

        if (error.message.includes('500') || error.message.includes('503')) {
        } else {
          setRetryCount(0);
        }
      });
  }

  useEffect(() => {
    checkServerStatus();
    const timer = setInterval(loadLeaderboard, 30000);
    return () => {
      clearInterval(timer);
      clearTimeout(retryTimeout.current);
    };
  }, []);

  const checkDuplicateName = (name) => {
    const existingUser = leaderboard.find(user => user.name === name);
    return existingUser ? existingUser.amount : 0;
  }

  const handleNameChange = (e) => {
    let value = e.target.value;
    if (value.length > 64) {
      value = value.substring(0, 64);
    }
    setUserName(value);
    if (userAmount) {
      setEstimatedRank(estimateRank(userAmount));
    }
  }

  const handleAmountChange = (e) => {
    let value = e.target.value;
    value = value.replace(/[^0-9]/g, '');
    if (value && parseInt(value) < 1) {
      value = '1';
    }
    setUserAmount(value);
  }

  const estimateRank = (amount) => {
    if (!amount || isNaN(amount) || amount <= 0) return null;
    const intAmount = Math.floor(parseInt(amount));
    let totalAmount = intAmount;
    const existingAmount = checkDuplicateName(userName);
    if (existingAmount) {
      totalAmount += Math.floor(existingAmount);
    }
    const currentAmounts = leaderboard.map(user => Math.floor(user.amount));
    let rank = 1;
    for (const amt of currentAmounts) {
      if (totalAmount <= amt) rank++;
    }
    return rank;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Form submission started");
    if (serverStatus !== 'ready') {
      alert('Server is not ready. Please try again later.');
      return;
    }
    if (!userName.trim()) {
      console.log("Username missing");
      alert('Please enter your name.');
      return;
    }
    const intAmount = parseInt(userAmount);
    if (!userAmount || isNaN(intAmount) || intAmount <= 0) {
      console.log("Invalid amount:", userAmount);
      alert('Please enter a valid amount (minimum $1).');
      return;
    }
    try {
      console.log("API request started");
      const response = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: userName,
          amount: intAmount
        })
      });

      if (!response.ok && (response.status === 500 || response.status === 503)) {
        alert('Server is busy. Please try again later.');
        return;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Server returned non-JSON response for payment request');
        alert('Server is not responding correctly. Please try again later.');
        return;
      }

      const data = await response.json();
      console.log("API response ", data);
      if (response.status === 500) {
        console.error("Server internal error:", data);
        alert('Server error. Please check console for details.');
        return;
      }
      if (data.approvalUrl) {
        console.log("Redirecting to PayPal:", data.approvalUrl);
        localStorage.setItem('pendingUser', JSON.stringify({
          name: data.name,
          amount: data.amount
        }));
        window.location.href = data.approvalUrl;
      } else {
        console.log("No approvalUrl", data);
        alert('Failed to create payment session.');
      }
    } catch (error) {
      console.error('Payment error details:', {
        message: error.message,
        stack: error.stack
      });
      alert('An error occurred during payment processing.');
    }
  }

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

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-gray-200 py-12 px-4 font-sans relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none opacity-10 background-grid"></div>
      
      <div className="max-w-3xl mx-auto relative">
        <h1 className="text-5xl font-extrabold text-center mb-2 text-yellow-400 tracking-tight">
          Golden<span className="text-white">Ranks</span>
        </h1>
        <p className="text-center text-yellow-300 text-sm mb-8 italic">Where Gold Meets Glory</p>
        <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700 relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-500"></div>
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4 font-bold border-b border-gray-700">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="text-gray-300">The Golden Leaderboard</span>
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
                  key={index}
                  className={`px-6 py-4 group relative ${
                    index < 10 ? (
                      index === 0 ? 'sparkle-gold' :
                      index === 1 ? 'sparkle-silver' :
                      index === 2 ? 'sparkle-bronze' :
                      'sparkle-highlight'
                    ) : ''
                  } transition-all duration-300 touch-item`}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
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
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center min-w-0">
                            <span className="font-bold text-gray-300 mr-4">
                              {index + 1}.
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className={`min-w-0 overflow-hidden transition-all duration-300 ${
                                hoveredIndex === index ? 'w-auto' : 'overflow-hidden'
                              }`}>
                                <span className={`font-bold text-gray-300 block ${
                                  hoveredIndex === index ? 'whitespace-pre-wrap break-all text-yellow-300' : 'overflow-hidden text-ellipsis whitespace-nowrap'
                                }`}>
                                  {user.name}
                                </span>
                                {hoveredIndex === index && (
                                  <div className="mt-1 text-xs text-gray-300 animate-fadeIn">
                                    <div className="flex items-center mb-1">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span className="text-yellow-400 font-medium">
                                        {index < 3 ? 'Crowned:' : 'Ranked:'}
                                      </span>
                                      <span className="ml-1">{formatDate(user.created_at)}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                      <span className="text-yellow-400 font-medium">ID:</span>
                                      <span className="ml-1">{user.id || 'N/A'}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center min-w-0 mt-1">
                                {index < 3 && (
                                  <div className={`mr-3 text-[0.75rem] opacity-100 transition-all duration-300`}>
                                    <div className={`${
                                      index === 0 ? 'bg-yellow-400/10 text-yellow-300' :
                                      index === 1 ? 'bg-gray-400/10 text-gray-300' :
                                      'bg-amber-400/10 text-amber-300'
                                    } px-1 py-0.5 rounded-full whitespace-nowrap`}>
                                      <span className="animate-pulse">
                                        {index === 0 ? 'GOLDEN KING' : index === 1 ? 'SILVER LORD' : 'BRONZE CHAMPION'}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                <span className={`italic text-[0.75rem] ${
                                  index < 3 ?
                                    (index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : 'text-amber-400') :
                                    'text-gray-400'
                                }`}>
                                  {index < 3 ? 'Crowned on' : 'Ranked on'} {formatDate(user.created_at)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center flex-shrink-0 ml-2 transition-all duration-300">
                      <div className={`font-extrabold text-lg ${
                        index < 3 ? 'text-yellow-400' : 'text-gray-300'
                      }`}>
                        ${Math.floor(user.amount).toLocaleString('en-US')}
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
            onClick={() => setShowForm(!showForm)}
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
          <div className="mt-8 bg-gray-800 p-6 rounded-xl shadow-xl border border-gray-700 relative overflow-hidden">
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
                    type="text"
                    id="amount"
                    value={userAmount}
                    onChange={handleAmountChange}
                    onBlur={() => {
                      if (userAmount) {
                        setEstimatedRank(estimateRank(userAmount));
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
                className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-gray-900 font-bold py-3 px-4 rounded-lg text-lg transition-all duration-300 shadow-md relative overflow-hidden group desktop-button flex flex-col items-center justify-center"
                disabled={!agreeTerms}
              >
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-800 to-yellow-900 transition-all duration-200 group-hover:-translate-y-1">
                  Golden Entry
                </span>
                <span className="text-xs text-gray-700 mt-1.5 group-hover:opacity-100 transition-all duration-150 transition-delay-100 desktop-payment-info">
                  Secure payment via PayPal • No hidden fees
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-300/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-x-full group-hover:translate-x-full"></div>
              </button>
              <div className="mt-3 flex flex-col items-center text-xs text-gray-400">
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    id="agreeTerms"
                    checked={agreeTerms}
                    onChange={e => setAgreeTerms(e.target.checked)}
                    className="mr-2"
                    required
                  />
                  <label htmlFor="agreeTerms">
                    By making a payment, you agree to the{' '}
                    <a
                      href="#"
                      onClick={e => {
                        e.preventDefault();
                        setShowTerms(true);
                      }}
                      className="underline hover:text-gray-300"
                    >
                      Terms & Conditions
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
              {/* PayPal Logo */}
              <a href="https://www.paypal.com" target="_blank" rel="noopener noreferrer">
                <img src="/PP.png" alt="PayPal Logo" />
              </a>
              {/* PayPal Logo */}
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
                  Terms & Conditions
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
      {showTerms && (
        <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-gray-800 bg-opacity-95 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto border border-yellow-500/30 shadow-2xl">
            <div className="p-7">
              <div className="flex items-center mb-5">
                <div className="bg-yellow-500/10 p-2 rounded-lg mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-yellow-400">Terms & Conditions</h2>
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
      )}
      {showPrivacy && (
        <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-gray-800 bg-opacity-95 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto border border-yellow-500/30 shadow-2xl">
            <div className="p-7">
              <div className="flex items-center mb-5">
                <div className="bg-yellow-500/10 p-2 rounded-lg mr-3">
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
                  className="bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-700 hover-to-gray-600 border border-gray-600 px-5 py-2.5 rounded-lg text-gray-200 font-medium transition-all duration-200 transform hover:scale-[1.03]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}