import { useState, useMemo } from 'react';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

// --- 환경 변수 ---
const PAYPAL_CLIENT_ID = "ATBq1CSf_gdmcNb8psZtrFf8g7xqGGLr6Z3lCRmwnz5ZkFUOo_xnoGTYUZ-aTJv2dAlSCWHFibaiuwyl";

// --- 데이터 ---
const surveyQuestions = [
    { id: 1, text: 'A difficult problem arises. What is your first instinct?', options: [{ text: 'Break it down and analyze the components', type: 'Analytical' }, { text: 'Brainstorm creative and unconventional solutions', type: 'Creative' }] },
    { id: 2, text: 'Which environment makes you feel more energized?', options: [{ text: 'Working collaboratively in a team', type: 'Social' }, { text: 'Focusing alone on a specific task', type: 'Solitary' }] },
    { id: 3, text: 'You are more interested in...', options: [{ text: 'Understanding abstract theories and concepts', type: 'Theoretical' }, { text: 'Building, creating, or fixing tangible things', type: 'Practical' }] },
    { id: 4, text: 'When making decisions, you rely more on...', options: [{ text: 'Logical reasoning and objective data', type: 'Analytical' }, { text: 'Empathy, feelings, and the impact on people', type: 'Social' }] },
    { id: 5, text: 'Which of the following sounds more appealing as a career?', options: [{ text: 'Developing new technologies to solve problems', type: 'STEM' }, { text: 'Creating art, music, or stories', type: 'Creative' }] },
    { id: 6, text: 'What kind of "truth" are you more drawn to?', options: [{ text: 'Empirical evidence and scientific facts', type: 'STEM' }, { text: 'Philosophical insights and human experiences', type: 'Humanities' }] },
    { id: 7, text: 'You enjoy tasks that require...', options: [{ text: 'Precision, organization, and attention to detail', type: 'Practical' }, { text: 'Seeing the "big picture" and strategic thinking', type: 'Theoretical' }] },
    { id: 8, text: 'How do you prefer to learn?', options: [{ text: 'Through structured classes and reading books', type: 'Theoretical' }, { text: 'Through hands-on experiments and real-world application', type: 'Practical' }] },
    { id: 9, text: 'Which topic are you more curious about?', options: [{ text: 'The laws of the universe and how machines work', type: 'STEM' }, { text: 'Human history, culture, and society', type: 'Humanities' }] },
    { id: 10, text: 'Your ideal work involves...', options: [{ text: 'Helping and interacting with people directly', type: 'Social' }, { text: 'Working with systems, data, or objects', type: 'Solitary' }] },
];

const majorDetails = {
    'Computer Science': {
        description: 'Computer Science is the study of computers and computational systems. Unlike electrical and computer engineering, computer science deals more with the software aspects of computing. This field focuses on the design, development, and analysis of software and software systems. Students learn programming languages, algorithms, data structures, software engineering principles, artificial intelligence, machine learning, and cybersecurity. Career paths include software developer, data scientist, AI researcher, cybersecurity specialist, and systems architect. The field requires strong analytical and problem-solving skills, with high demand in virtually every industry from tech startups to finance, healthcare, and government sectors.',
        tags: ['Analytical', 'STEM', 'Solitary', 'Theoretical'],
        color: 'from-blue-600 to-indigo-700'
    },
    'Mechanical Engineering': {
        description: 'Mechanical Engineering is one of the broadest engineering disciplines, combining principles of physics and mathematics to design, analyze, manufacture, and maintain mechanical systems. This field encompasses the production and usage of heat and mechanical power for the design, production, and operation of machines and tools. Students study mechanics, thermodynamics, fluid dynamics, materials science, and structural analysis. Career opportunities include automotive design, aerospace engineering, robotics, manufacturing, energy systems, and biomedical devices. The profession requires strong mathematical abilities, creativity in design, and practical problem-solving skills. Mechanical engineers work in diverse industries including automotive, aerospace, energy, manufacturing, and biotechnology.',
        tags: ['Practical', 'STEM', 'Analytical'],
        color: 'from-gray-600 to-slate-700'
    },
    'Psychology': {
        description: 'Psychology is the scientific study of the mind and behavior, examining how individuals think, feel, and act both individually and in groups. This discipline explores cognitive processes, emotional development, social interactions, and mental health. Students learn about research methods, statistical analysis, developmental psychology, cognitive neuroscience, social psychology, and clinical practice. Career paths include clinical psychologist, research scientist, organizational consultant, human resources specialist, market researcher, and academic professor. The field requires empathy, strong communication skills, and analytical thinking. Psychology graduates work in healthcare, education, business, government, and research institutions, contributing to mental health services, organizational development, and human behavior research.',
        tags: ['Social', 'Humanities', 'Theoretical', 'Analytical'],
        color: 'from-rose-600 to-pink-700'
    },
    'Fine Arts': {
        description: 'Fine Arts encompasses the creation of visual art forms including painting, sculpture, drawing, printmaking, and mixed media. This field emphasizes creative expression, artistic technique, and conceptual development. Students study art history, color theory, composition, various artistic mediums, and contemporary art practices. Career opportunities include professional artist, art educator, gallery curator, art therapist, graphic designer, and art conservator. The discipline requires creative vision, technical skill, and the ability to communicate ideas visually. Fine arts professionals work in studios, galleries, museums, educational institutions, and commercial design firms. This field cultivates critical thinking, cultural awareness, and aesthetic sensibility while preparing students for diverse creative careers.',
        tags: ['Creative', 'Humanities', 'Solitary'],
        color: 'from-purple-600 to-fuchsia-700'
    },
    'Business Administration': {
        description: 'Business Administration encompasses the management and operation of business organizations across various sectors. This field covers strategic planning, organizational behavior, finance, marketing, operations management, and human resources. Students learn business analytics, leadership principles, entrepreneurship, international business, and ethical decision-making. Career paths include business manager, entrepreneur, marketing director, financial analyst, operations consultant, and human resources specialist. The profession requires strong leadership abilities, analytical thinking, and communication skills. Business administration graduates work in corporations, startups, non-profits, government agencies, and consulting firms, driving organizational success and innovation in the global economy.',
        tags: ['Social', 'Analytical', 'Practical'],
        color: 'from-emerald-600 to-teal-700'
    },
    'Communications': {
        description: 'Communications is the study of how information is created, shared, and interpreted across various media platforms and social contexts. This interdisciplinary field examines mass media, digital communication, public relations, journalism, and interpersonal communication. Students learn media theory, content creation, digital marketing, public speaking, and strategic communication planning. Career opportunities include public relations specialist, marketing coordinator, journalist, content creator, social media manager, and corporate communications director. The field requires excellent writing skills, creativity, and understanding of audience engagement. Communications professionals work in media companies, advertising agencies, corporate settings, government organizations, and digital marketing firms, shaping public discourse and brand messaging.',
        tags: ['Social', 'Creative', 'Humanities'],
        color: 'from-amber-600 to-orange-700'
    }
};

// --- 컴포넌트들 ---
function LegalModal({ title, content, onClose }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-4 animate-fade-in-fast">
            <div className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-700">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-2xl">
                    <h2 className="text-2xl font-bold text-indigo-400">{title}</h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white text-3xl leading-none transition-colors"
                    >
                        &times;
                    </button>
                </div>
                <div className="p-6 overflow-y-auto text-slate-300 styled-scrollbar flex-grow">
                    <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed">{content}</pre>
                </div>
                {/* O 요구사항 4번: Close 버튼을 가운데 정렬하기 위해 text-right -> text-center로 수정 */}
                <div className="p-6 bg-slate-800/50 border-t border-slate-700 rounded-b-2xl text-center">
                    <button
                        onClick={onClose}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl transition-all transform hover:scale-105 shadow-lg"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

function PayPalPayment({ amount, onPaymentSuccess, onPaymentError, disabled }) {
    const createOrder = (_, actions) => {
        return actions.order.create({ purchase_units: [{ amount: { value: amount } }] });
    };
    const onApprove = (_, actions) => {
        return actions.order.capture().then(details => onPaymentSuccess(details));
    };

    return (
        <div className={`transition-opacity duration-300 ${disabled ? 'opacity-50 cursor-not-allowed' : 'opacity-100'}`}>
            <div className="flex justify-center">
                <PayPalButtons
                    style={{ layout: "vertical", color: "blue", shape: "rect", label: "pay" }}
                    createOrder={createOrder}
                    onApprove={onApprove}
                    onError={onPaymentError}
                    disabled={disabled}
                    forceReRender={[amount, disabled]}
                />
            </div>
        </div>
    );
}

// 메인 앱 컴포넌트
export default function App() {
    const [step, setStep] = useState('survey');
    const [answers, setAnswers] = useState({});
    const [recommendedMajors, setRecommendedMajors] = useState([]);
    const [selectedMajor, setSelectedMajor] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [agreeTerms, setAgreeTerms] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [showPrivacy, setShowPrivacy] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState('idle');

    const answeredQuestions = Object.keys(answers).length;
    const surveyProgress = (answeredQuestions / surveyQuestions.length) * 100;
    const allQuestionsAnswered = answeredQuestions === surveyQuestions.length;

    const handleAnswer = (questionId, type) => {
        setAnswers(prev => ({ ...prev, [questionId]: type }));
    };

    const handleSubmitSurvey = () => {
        setStep('loading');
        setTimeout(() => {
            const scores = { Analytical: 0, Creative: 0, Social: 0, Solitary: 0, Theoretical: 0, Practical: 0, STEM: 0, Humanities: 0 };
            Object.values(answers).forEach(type => { if (scores[type] !== undefined) scores[type]++; });

            const recommendations = Object.keys(majorDetails)
                .map(major => {
                    const majorTags = majorDetails[major].tags;
                    const score = majorTags.reduce((acc, tag) => acc + (scores[tag] || 0), 0);
                    return { major, score };
                })
                .sort((a, b) => b.score - a.score)
                .slice(0, 4)
                .map(item => item.major);

            setRecommendedMajors(recommendations);
            setStep('result');
        }, 1500);
    };
    
    const handlePaymentAmountChange = (e) => {
        const value = e.target.value;
        // 사용자가 입력을 모두 지울 수 있도록 빈 문자열 허용
        if (value === '') {
            setPaymentAmount('');
            return;
        }
        // 정수 형태의 숫자만 허용 (소수점 및 마이너스 방지)
        const intValue = parseInt(value, 10);
        if (!isNaN(intValue) && intValue >= 1 && String(intValue) === value) {
            setPaymentAmount(intValue);
        }
    };

    const handleReset = () => {
        setStep('survey');
        setAnswers({});
        setSelectedMajor(null);
        setPaymentStatus('idle');
        setAgreeTerms(false);
        setPaymentAmount('');
    };

    const handlePaymentSuccess = (details) => {
        console.log('Payment Successful:', details);
        setPaymentStatus('success');
    };

    // --- 법률 고지 내용 ---
    const termsContent = useMemo(() => `
MajorPick Terms of Service
Last Updated: October 1, 2025

**DISCLAIMER:** The recommendations provided by MajorPick are for informational and entertainment purposes only. They do not constitute professional, educational, or career advice. You should always consult with qualified professionals before making any educational or career decisions.

1.  **Acceptance of Terms**
    By accessing or using MajorPick ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of the terms, you may not access the Service.

2.  **Description of Service**
    MajorPick provides a survey designed to suggest potential university majors based on user-provided, anonymous answers. The matching algorithm is a simplified model and is not guaranteed to be accurate or suitable for every individual.

3.  **User Data and Privacy**
    We respect your privacy. All survey answers are processed anonymously and are not stored or linked to any personal identifiers. Please review our Privacy Policy for more details.

4.  **Voluntary Payments**
    The Service is free to use. We offer an option to make a voluntary payment via PayPal to support the maintenance and development of MajorPick. These payments are non-refundable donations and do not grant any additional features or guarantees.

5.  **Intellectual Property**
    The Service and its original content, features, and functionality are and will remain the exclusive property of MajorPick and its licensors.

6.  **Disclaimer of Warranties**
    The Service is provided on an "AS IS" and "AS AVAILABLE" basis. We make no warranties, express or implied, regarding the accuracy, reliability, or completeness of the recommendations.

7.  **Limitation of Liability**
    In no event shall MajorPick, nor its directors, employees, partners, or agents, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.

8.  **Governing Law**
    These Terms shall be governed in accordance with the laws of the jurisdiction in which the service is based, without regard to its conflict of law provisions.

9.  **Changes to Terms**
    We reserve the right, at our sole discretion, to modify or replace these Terms at any time.

10. **Contact Us**
    If you have any questions about these Terms, please contact us at xaa0600@gmail.com.
  `, []);

    const privacyContent = useMemo(() => `
MajorPick Privacy Policy
Last Updated: October 1, 2025

1.  **Introduction**
    MajorPick ("we," "our," "us") is committed to protecting your privacy. This Privacy Policy explains how we handle information when you use our service.

2.  **Information We Do Not Collect**
    We have designed our service to be fundamentally private. We DO NOT collect, store, or process any Personally Identifiable Information (PII) such as your name, email address, IP address, or location.

3.  **Information We Process**
    The only information we process is your set of answers to the survey questions. This data is:
    -   **Anonymous:** It is not linked to you in any way.
    -   **Ephemeral:** It is held in memory only for the duration of your session to calculate your recommendation and is discarded immediately after. It is never written to a database or log file.

4.  **How We Use Information**
    Your anonymous survey answers are used solely for the purpose of running our recommendation algorithm to provide you with a list of suggested university majors.

5.  **Third-Party Services (PayPal)**
    If you choose to make a voluntary payment, you will be redirected to PayPal. Any personal and payment information you provide is given directly to PayPal. Their use of your information is governed by their own privacy policy. We do not receive any of your personal financial information from PayPal, other than a confirmation that a payment was completed.

6.  **Children's Privacy**
    Our service is not directed to individuals under the age of 16. We do not knowingly collect any information from children. As we do not collect PII, we have no way of verifying user age.

7.  **Data Security**
    We implement reasonable technical measures to ensure the secure, temporary processing of your anonymous data during your session.

8.  **Changes to This Policy**
    We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.

9.  **Contact Us**
    If you have any questions about this Privacy Policy, please contact us at xaa0600@gmail.com.
  `, []);

    return (
        <PayPalScriptProvider options={{ "client-id": PAYPAL_CLIENT_ID, currency: "USD", intent: "capture" }}>
            <div className="bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 text-white min-h-screen font-sans">
                <div className="container mx-auto px-4 py-8">

                    <header className="text-center mb-10 md:mb-12">
                        <h1 className="text-5xl md:text-6xl font-extrabold mb-4">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-pink-500 drop-shadow-lg">
                                MajorPick
                            </span>
                        </h1>
                        <div className="w-32 h-1 bg-gradient-to-r from-yellow-400 to-pink-500 mx-auto rounded-full mb-6"></div>
                        <p className="text-indigo-200 text-lg max-w-2xl mx-auto font-medium">
                            Discover your ideal university major through our insightful, personalized survey
                        </p>
                    </header>

                    <main className="bg-slate-800/40 backdrop-blur-xl rounded-3xl shadow-2xl p-6 md:p-10 max-w-4xl mx-auto border border-white/10">
                        {step === 'survey' && (
                            <div className="animate-fade-in">
                                <h2 className="text-3xl font-bold mb-4 text-center text-white">Find Your Academic Path</h2>
                                <p className="text-center text-indigo-200 mb-8 text-lg">Answer {surveyQuestions.length} questions to reveal your personalized major recommendations</p>
                                <div className="w-full bg-slate-700/50 rounded-full h-3 mb-10">
                                    <div className="bg-gradient-to-r from-yellow-500 to-orange-500 h-3 rounded-full transition-all duration-700 ease-out" style={{ width: `${surveyProgress}%` }}></div>
                                </div>

                                <div className="space-y-10">
                                    {surveyQuestions.map((q, index) => (
                                        <div key={q.id} className="bg-slate-700/30 p-7 rounded-2xl border border-white/10 shadow-lg">
                                            <p className="text-xl font-semibold mb-6 text-white leading-relaxed">
                                                <span className="text-yellow-400 font-extrabold mr-3">{index + 1}.</span> {q.text}
                                            </p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {q.options.map(opt => (
                                                    <button
                                                        key={opt.text}
                                                        onClick={() => handleAnswer(q.id, opt.type)}
                                                        className={`survey-option ${answers[q.id] === opt.type ? 'active' : ''}`}
                                                    >
                                                        <span className="text-left">{opt.text}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="text-center mt-12">
                                    <button
                                        onClick={handleSubmitSurvey}
                                        disabled={!allQuestionsAnswered}
                                        className="action-button"
                                    >
                                        Calculate My Recommendations
                                    </button>
                                    {!allQuestionsAnswered && <p className="text-indigo-300 mt-4 text-base">Please answer all questions to proceed</p>}
                                </div>
                            </div>
                        )}

                        {step === 'loading' && (
                            <div className="text-center py-20 animate-fade-in">
                                <div className="loader mx-auto mb-8"></div>
                                <h2 className="text-3xl font-bold text-white mb-3">Analyzing Your Profile</h2>
                                <p className="text-indigo-200 text-xl">Generating personalized major recommendations...</p>
                                <div className="mt-8 flex justify-center">
                                    <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full animate-pulse" style={{ width: '75%' }}></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 'result' && (
                            <div className="animate-fade-in">
                                <h2 className="text-3xl font-bold mb-3 text-center text-white">Your Personalized Major Recommendations</h2>
                                <p className="text-center text-indigo-200 mb-10 text-lg">Based on your unique profile and preferences</p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                                    {recommendedMajors.map((major, index) => (
                                        <button
                                            key={major}
                                            onClick={() => setSelectedMajor(major)}
                                            className={`major-card ${selectedMajor === major ? 'active' : ''}`}
                                        >
                                            <div className="flex items-center">
                                                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${majorDetails[major].color} flex items-center justify-center mr-4 flex-shrink-0`}>
                                                    <span className="text-white font-bold text-lg">{index + 1}</span>
                                                </div>
                                                <div className="text-left">
                                                    <h3 className="text-xl font-bold text-white">{major}</h3>
                                                    <p className="text-indigo-200 text-sm mt-1">Click for detailed information</p>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {selectedMajor && (
                                    <div className="bg-slate-700/40 p-8 rounded-2xl mb-10 border border-white/10 animate-fade-in-slow">
                                        <div className="flex items-start mb-6">
                                            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${majorDetails[selectedMajor].color} flex items-center justify-center mr-6 flex-shrink-0`}>
                                                <span className="text-white font-bold text-2xl">{recommendedMajors.indexOf(selectedMajor) + 1}</span>
                                            </div>
                                            <div>
                                                <h3 className="text-3xl font-bold text-yellow-400 mb-2">{selectedMajor}</h3>
                                                <div className="w-24 h-1 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full"></div>
                                            </div>
                                        </div>
                                        <div className="prose prose-invert max-w-none">
                                            <p className="text-white text-lg leading-relaxed">{majorDetails[selectedMajor].description}</p>
                                        </div>
                                    </div>
                                )}

                                {paymentStatus !== 'success' ? (
                                    <div className="border-t border-white/10 pt-10 mt-10">
                                        <h3 className="text-2xl font-bold text-center text-white mb-3">Support Our Service</h3>
                                        <p className="text-center text-indigo-200 mb-8 text-lg">Your contribution helps us improve and maintain this service</p>

                                        <div className="max-w-md mx-auto">
                                            <div className="mb-8">
                                                {/* O 요구사항 2번: 금액 입력칸과 달러 표시 위치 조정 */}
                                                <div className="flex items-center justify-center mb-6 relative w-40 mx-auto">
                                                    <span className="text-white text-2xl absolute left-0 top-1/2 -translate-y-1/2 pl-5 pointer-events-none">$</span>
                                                    <input
                                                        type="text"
                                                        pattern="[0-9]*"
                                                        placeholder="Amount"
                                                        value={paymentAmount}
                                                        onChange={handlePaymentAmountChange}
                                                        className="w-full px-5 py-4 pl-10 bg-slate-700/50 border border-white/20 rounded-2xl text-white text-center text-xl focus:outline-none focus:ring-4 focus:ring-yellow-500/50 placeholder-slate-400 shadow-lg"
                                                    />
                                                </div>
                                            </div>
                                            <div className="mb-6">
                                                <PayPalPayment
                                                    amount={String(paymentAmount || '1')}
                                                    onPaymentSuccess={handlePaymentSuccess}
                                                    onPaymentError={(err) => { console.error(err); setPaymentStatus('error'); }}
                                                    disabled={!agreeTerms || !paymentAmount || paymentAmount < 1}
                                                />
                                            </div>
                                            <div className="flex items-center justify-center">
                                                <input
                                                    type="checkbox"
                                                    id="terms"
                                                    checked={agreeTerms}
                                                    onChange={(e) => setAgreeTerms(e.target.checked)}
                                                    className="h-6 w-6 rounded bg-slate-700 border-white/30 text-yellow-500 focus:ring-yellow-500 mr-3"
                                                />
                                                {/* O 요구사항 1번: 약관 동의 문구를 작게 만들기 위해 text-lg -> text-sm 으로 수정 */}
                                                <label htmlFor="terms" className="text-indigo-200 text-sm">
                                                    I agree to the{' '}
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowTerms(true)}
                                                        className="legal-link font-bold"
                                                    >
                                                        Terms of Service
                                                    </button>{' '}
                                                    and{' '}
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPrivacy(true)}
                                                        className="legal-link font-bold"
                                                    >
                                                        Privacy Policy
                                                    </button>
                                                </label>
                                            </div>
                                            {paymentStatus === 'error' && <p className="text-red-400 text-center mt-6 text-lg">Payment failed. Please try again.</p>}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center p-10 bg-emerald-500/20 rounded-2xl border border-emerald-400/30">
                                        <div className="text-5xl mb-4">🎉</div>
                                        <h3 className="text-3xl font-bold text-emerald-400 mb-3">Thank You for Your Support!</h3>
                                        <p className="text-white text-xl">Your contribution helps us continue providing valuable career guidance</p>
                                    </div>
                                )}

                                <div className="text-center mt-12">
                                    <button
                                        onClick={handleReset}
                                        className="text-indigo-300 hover:text-yellow-400 underline transition-colors text-lg font-medium"
                                    >
                                        Take the survey again
                                    </button>
                                </div>
                            </div>
                        )}
                    </main>

                    <footer className="text-center mt-16 text-indigo-300">
                        <p className="mb-4 text-lg">Recommendations are for informational purposes only and do not constitute professional advice</p>
                        <p>
                            <button
                                type="button"
                                onClick={() => setShowTerms(true)}
                                className="legal-link mx-4 font-bold text-lg"
                            >
                                Terms of Service
                            </button>
                            <span className="text-indigo-500">|</span>
                            <button
                                type="button"
                                onClick={() => setShowPrivacy(true)}
                                className="legal-link mx-4 font-bold text-lg"
                            >
                                Privacy Policy
                            </button>
                        </p>
                        <p className="mt-6 text-indigo-400 font-medium">© 2025 MajorPick. All Rights Reserved.</p>
                    </footer>
                </div>

                {(showTerms || showPrivacy) && (
                    <LegalModal
                        title={showTerms ? "Terms of Service" : "Privacy Policy"}
                        content={showTerms ? termsContent : privacyContent}
                        onClose={() => {
                            setShowTerms(false);
                            setShowPrivacy(false);
                        }}
                    />
                )}
            </div>
        </PayPalScriptProvider>
    );
}