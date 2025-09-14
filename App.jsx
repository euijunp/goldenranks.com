import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

function DatabaseView() {
  const [data, setData] = useState([]);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // Initial data load and load on search/page change
  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = `/api/db?page=${page}&name=${encodeURIComponent(debouncedSearchTerm)}`;

    fetch(url)
      .then(res => {
        if (!res.ok) {
            if (res.status === 429) {
                return res.text().then(text => { throw new Error(text) });
            }
            throw new Error('Failed to fetch database content.');
        }
        return res.json();
      })
      .then(newData => {
        setData(prevData => (page === 1 ? newData : [...prevData, ...newData]));
        setHasMore(newData.length === 100);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [page, debouncedSearchTerm]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      const url = `/api/db?page=1&name=${encodeURIComponent(debouncedSearchTerm)}`;
      fetch(url)
        .then(res => {
          if (!res.ok) return; // Fail silently on auto-refresh
          return res.json();
        })
        .then(newData => {
          if (newData) {
            setPage(1);
            setData(newData);
          }
        })
        .catch(err => {
          console.error("Auto-refresh failed:", err.message);
        });
    }, 30000);
    return () => clearInterval(timer);
  }, [debouncedSearchTerm]);


  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString.replace(' ', 'T') + 'Z');
      if (isNaN(date.getTime())) return 'N/A';

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');

      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch {
      return 'N/A';
    }
  };

  const maskTransactionId = (id) => {
    if (!id || id.length <= 4) return id || 'N/A';
    return id.slice(0, -4).replace(/./g, '*') + id.slice(-4);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-gray-200 py-12 px-4 font-sans relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none opacity-10 background-grid"></div>
      <div className="db-view-container">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-extrabold text-yellow-400 mb-2">Golden<span className="text-white">Ranks</span> Open Database</h1>
            <p className="text-gray-400">Full transparency on the latest 100 transactions.</p>
            <a href="/" className="text-yellow-500 hover:underline mt-4 inline-block">&larr; Go Back</a>
          </div>

          <div className="db-table-wrapper">
            <table className="db-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Amount</th>
                  <th>Timestamp</th>
                  <th>Verified</th>
                  <th>PayPal Transaction ID</th>
                </tr>
              </thead>
              <tbody>
                {data.map(row => (
                  <tr key={row.id}>
                    <td className="font-mono break-all">{row.name}</td>
                    <td>${row.amount.toLocaleString()}</td>
                    <td>{formatDate(row.created_at)}</td>
                    <td>
                      <span className={row.verified ? 'verified-true' : 'verified-false'}>
                        {row.verified ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="font-mono">{maskTransactionId(row.paypal_transaction_id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {loading && <div className="text-center py-4">Loading...</div>}
          {error && <div className="text-center text-red-400 py-4">{error}</div>}

          {!loading && hasMore && (
            <div className="text-center mt-6">
              <button
                onClick={() => setPage(p => p + 1)}
                className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-6 py-2 rounded-lg font-bold transition-colors"
              >
                Load More
              </button>
            </div>
          )}

          <div className="mt-8 max-w-lg mx-auto">
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Search by name..."
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-white placeholder-gray-400"
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function MainLeaderboard() {
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
  const [summary, setSummary] = useState(null);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isScrolling = useRef(false);
  const touchTimer = useRef(null);
  const lastTouchTime = useRef(0);
  const retryTimeout = useRef(null);
  const verificationInterval = useRef(null);
  const formRef = useRef(null);
  const amountInputRef = useRef(null);

  const termsContent = `Effective Date: 2025-09-13
Last Updated: 2025-09-13

Welcome to GoldenRanks ("the Site"). By accessing or using this Site, you agree to be bound by these Terms of Service ("Terms"). If you do not agree, please do not use the Site.

1. General Overview
The Site provides an online platform where users may make voluntary payments via PayPal. Users are displayed on a public Leaderboard, ranked according to the total amount they have contributed. In addition to the Leaderboard, individual contribution records are made public on a separate Database page for transparency. Payments are considered voluntary contributions and do not entitle the contributor to ownership rights, services, or goods, unless explicitly stated.

2. Eligibility
You must be at least 18 years of age (or the age of majority in your jurisdiction) to use the Site. By using the Site, you confirm that you are legally able to enter into this agreement.

3. Payments
All payments are processed securely through PayPal. Payments are final and non-refundable. By submitting a payment, you acknowledge that the service has been fully delivered by your placement on the Leaderboard. Refunds will not be issued under any circumstances, except where required by applicable law. You are responsible for any fees, charges, or taxes related to your transactions.

4. Leaderboard
Leaderboard rankings are based solely on the aggregated total amount of payments made through the Site. If two or more contributors have the same total amount, the contributor with the most recent contribution time will be ranked higher. Placement is updated automatically once a payment is confirmed. The update may take a few minutes at most due to connection issues. Leaderboard display is for informational and entertainment purposes only and does not represent ownership, status, or rewards. GoldenRanks is not responsible for errors, delays, or interruptions in payment processing that may affect leaderboard placement. For transparency, all individual contributions are also displayed on a public Database page. This page shows the contributor's name, amount, timestamp, and a masked version of the transaction ID. Usernames or IDs are submitted by contributors during the payment process. We do not verify the accuracy of these names. The appearance of a name does not imply that the person or entity is affiliated with or endorses the Site. The leaderboard data is regularly backed up. Backups are retained for a limited time and then permanently deleted. The leaderboard will not be manually changed or altered by administrators under any circumstances, except to remove entries that contain obscene, pornographic, vulgar, defamatory, discriminatory, or otherwise offensive content. The only way to change placement on the leaderboard is through additional payments. We reserve the right to adjust, remove, or reset leaderboard entries only in cases of fraud, abuse, illegal content, or technical malfunction.

5. User Conduct
You agree not to:

Use the Site for unlawful purposes (including money laundering, fraud, or prohibited transactions).

Interfere with or disrupt the Site’s security or functionality.

Submit content, usernames, or IDs that are obscene, pornographic, vulgar, hateful, defamatory, discriminatory, or otherwise offensive. (Note: Using celebrity names or public figures is permitted under Section 4 as long as it does not cross into illegal or harmful use.)

6. Intellectual Property
All content, design, and branding on the Site are the property of GoldenRanks and protected by copyright and trademark laws. You may not copy, reproduce, or redistribute any part of the Site without prior written consent.

7. Disclaimer of Warranties
The Site is provided “as is” and “as available.” We make no guarantees that the Site will be uninterrupted, secure, or error-free.

8. Limitation of Liability
To the fullest extent permitted by law, GoldenRanks is not liable for any direct, indirect, incidental, or consequential damages arising from your use of the Site.

9. Termination
We may suspend or terminate your access to the Site at any time if you violate these Terms or engage in prohibited conduct.

10. Governing Law
These Terms are governed by and construed in accordance with the laws of the country in which the Site’s administrator resides, without regard to conflict of law principles. By using the Site, you agree that any disputes, claims, or proceedings arising out of or relating to these Terms shall be subject to the exclusive jurisdiction of the competent courts in that country. This applies to all users worldwide, regardless of their place of residence or nationality.

11. Changes to Terms
We may update these Terms from time to time. Continued use of the Site after changes are posted constitutes acceptance of the revised Terms.

12. Contact
If you have questions about these Terms, contact us at: Email: contact@goldenranks.com`

  const privacyContent = `Effective Date: 2025-09-13
Last Updated: 2025-09-13

This Privacy Policy explains how GoldenRanks ("the Site," "we," "us") collects, uses, and protects your personal information. By using the Site, you consent to the practices described below.

1. Information We Collect
When you interact with the Site, we collect information to operate the service and ensure its security.

A. Information You Provide

Username/ID: The name or identifier you submit to be displayed on the Leaderboard.

Contribution Amount: The monetary value you choose to contribute.

B. Information We Collect Automatically

Server Logs and IP Addresses: When you visit the Site, our servers automatically log standard data, including your IP address. This information is used for security purposes, such as fraud prevention, abuse monitoring, and rate limiting.

Cookies: We use session cookies to maintain the basic functionality of the Site. A cookie is a small text file stored on your device that helps us manage your session.

C. Information from Third Parties

Payment Verification Data: Payments are processed exclusively by PayPal. We do not collect or store your credit card number, bank account details, or PayPal password. After a successful transaction, PayPal provides us with a Transaction ID and confirmation of payment, which we store to verify your contribution.

D. Browser Storage (Local Storage)

During the payment process, we temporarily store the Username and Amount you entered in your browser’s local storage. This is to ensure your data is not lost when you are redirected to PayPal and back. This temporary data is cleared once the payment process is completed or fails.

2. How We Use Your Information
We use the information we collect to:

Display your contributions on the public Leaderboard and Database page.

Process and verify payments in conjunction with PayPal.

Operate, maintain, and secure the Site, including preventing fraud and abuse.

Comply with legal and regulatory obligations.

3. Sharing of Information
A core feature of the Site is the public display of contribution data. By making a payment, you consent to have your submitted Username/ID and contribution amount(s) displayed publicly on our Leaderboard and Database page.

We do not sell or rent your personal information to third parties for marketing purposes. We only share information as follows:

With Payment Processors: We share necessary information (such as the contribution amount) with PayPal to initiate and process your payment.

As Required by Law: We may disclose your information if required to do so by law or in response to a valid legal request.

4. Data Retention
Information submitted for the Leaderboard and Database page (including Username/ID, amount, and transaction data) is retained indefinitely for the lifetime of the service to maintain the integrity of the public historical record.

Server logs containing IP addresses are retained for a limited period necessary for security and operational analysis, after which they are deleted. Temporary data stored in your browser's local storage is cleared immediately upon completion of the payment process.

5. User Rights
Depending on your location, you may have the following rights:

GDPR (EU/UK users): Right to access, correct, delete, or restrict processing of your personal data. You also have the right to object to processing and to request data portability.

CCPA/CPRA (California users): Right to know what data we collect, to request deletion of personal data, and to opt out of data sharing.

To exercise these rights, please contact us (see Section 8).

6. Age Restrictions
The Site is intended for users 18 years or older. We do not knowingly collect personal information from children. If we learn that we have collected information from a minor, we will promptly delete it.

7. Security and Data Backups
We take reasonable technical and organizational measures to protect your data. However, no system is 100% secure, and we cannot guarantee absolute security of information transmitted over the internet.

For the purpose of disaster recovery, we maintain a robust backup policy for our database.

Backup Schedule: The database is backed up automatically on a daily schedule. Additionally, a backup is performed every time the server reboots to protect against data loss from unexpected outages.

Retention Policy: Backup files are securely stored for a maximum of 30 days. Any backup file older than 30 days is automatically and permanently deleted.

Security: All backup files are stored with restricted permissions, accessible only to authorized system administrators, to prevent unauthorized access.

If you request the deletion of your data from our live database, it may remain in our encrypted backup archives for up to 30 days until the next deletion cycle. This archived data will not be used for any purpose other than system restoration.

8. Contact Us
If you have questions about this Privacy Policy or your personal data, please contact us at: Email: contact@goldenranks.com

9. Changes to This Policy
We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated effective date. Continued use of the Site after changes are posted constitutes acceptance of the revised Privacy Policy.`

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

    fetch('/api/leaderboard/summary')
      .then(response => response.json())
      .then(data => setSummary(data))
      .catch(error => console.error('Failed to load summary:', error));
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
            <h2 className="text-3xl font-bold text-yellow-400 mb-2 text-center">Verifying Your Payment...</h2>
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
        <p className="text-center text-gray-300 text-base mb-8 px-4 font-semibold">Just prove it.</p>
        <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700 relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-500"></div>
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4 font-bold border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-gray-300">The <span className="summary-count-shine">24k</span> Leaderboard</span>
              </div>
              <div className="relative">
                <button
                    onClick={handleShare}
                    className="share-button text-gray-400 hover:text-yellow-400 transition-colors duration-200"
                    aria-label="Copy link"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {/* THIS IS THE CORRECTED PATH FOR THE SHARE ICON */}
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.59 13.51l6.83 3.98M15.41 16.49l-6.82-3.98" />
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
                  style={isRecent(user.created_at) ? { animationDelay: `-${(Math.random() * 3).toFixed(2)}s` } : {}}
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
          {summary && summary.userCount > 0 && leaderboard.length > 0 && (
            <div className="leaderboard-summary">
              ...and <strong className="summary-count-shine">{summary.userCount.toLocaleString()}</strong> other golden contributor{summary.userCount > 1 ? 's are' : ' is'} waiting below.
            </div>
          )}
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
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
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
                    className="pl-12 w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-white placeholder-gray-400 transition-all duration-200"
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
          <div className="flex flex-col md:flex-row items-center justify-between">
            {/* PayPal (Desktop) */}
            <div className="hidden md:block flex-shrink-0">
              <div className="paypal-logo-container">
                <a href="https://www.paypal.com" target="_blank" rel="noopener noreferrer">
                  <img src="/PP.png" alt="PayPal Logo" />
                </a>
              </div>
            </div>
            
            {/* Text Content (All Screens) */}
            <div className="w-full md:w-auto text-center">
              <div className="flex justify-center space-x-4 md:space-x-6 flex-wrap">
                <a href="#" onClick={(e) => { e.preventDefault(); setShowTerms(true); }} className="text-gray-400 hover:text-yellow-400 transition-colors duration-200 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  Terms of Service
                </a>
                <a href="#" onClick={(e) => { e.preventDefault(); setShowPrivacy(true); }} className="text-gray-400 hover:text-yellow-400 transition-colors duration-200 flex items-center">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  Privacy
                </a>
                <a href="/db" className="text-gray-400 hover:text-yellow-400 transition-colors duration-200 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7l8-4 8 4m-8 12v4m-4-8v4m8-4v4" /></svg>
                  Database
                </a>
              </div>
              <div className="mt-2 text-center text-xs text-gray-400">Leaderboard is secured and verified by GoldenRanks.com</div>
              <div className="mt-2 text-center text-xs text-gray-500">© 2025 GoldenRanks.com. All Rights Reserved.</div>
            </div>
            
            {/* Cloudflare (Desktop) */}
            <div className="hidden md:block flex-shrink-0">
              <div className="cloudflare-logo-container">
                <a href="https://www.cloudflare.com" target="_blank" rel="noopener noreferrer">
                  <img src="/CF.png" alt="Protected by Cloudflare" />
                </a>
              </div>
            </div>
          </div>
          
          {/* Logos (Mobile Only) - UPDATED */}
          <div className="flex w-full justify-center items-center space-x-12 mt-4 md:hidden">
            <div className="paypal-logo-container">
              <a href="https://www.paypal.com" target="_blank" rel="noopener noreferrer">
                <img src="/PP.png" alt="PayPal Logo" />
              </a>
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

export default function App() {
  const path = window.location.pathname;

  if (path === '/db') {
    return <DatabaseView />;
  }

  return <MainLeaderboard />;
}