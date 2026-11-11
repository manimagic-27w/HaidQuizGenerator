import Link from "next/link";
import { requireParent } from "@/lib/auth";
import { IDLE_MS, RUSH_MS } from "@/lib/metrics";

export const metadata = { title: "Parent quick start · Quiz Desk" };

const SECTIONS = [
  ["invite", "Invite your kids"],
  ["quiz", "Make a quiz"],
  ["spelling", "Make a spelling list"],
  ["kids", "What your kids see"],
  ["progress", "Check how it's going"],
  ["round", "Make the next round"],
  ["limit", "Your monthly limit"],
  ["help", "If something's off"],
] as const;

export default async function Guide() {
  await requireParent();
  const rush = RUSH_MS / 1000, idle = IDLE_MS / 1000;

  return (
    <article className="guide">
      <header className="stack">
        <div className="label">Parent quick start</div>
        <h1>Getting started with Quiz Desk</h1>
        <p className="lede">Turn a study guide or a spelling list into practice your kids can do on any device, and see how much real study time goes into it. Setup takes about five minutes.</p>
      </header>

      <nav className="toc" aria-label="On this page">
        <ol>{SECTIONS.map(([id, t]) => <li key={id}><a href={`#${id}`}>{t}</a></li>)}</ol>
      </nav>

      <section id="invite">
        <h2><span className="step">1</span>Invite your kids</h2>
        <ol>
          <li>Open the <Link href="/parent">Parent</Link> tab and scroll to <b>Family</b> at the bottom.</li>
          <li>Type your child&apos;s email and tap <b>Send invite</b>. Any email works: Gmail, AOL, Yahoo, school or work.</li>
          <li>They get an invitation email, tap the link, and create an account <b>with that same email</b>.</li>
        </ol>
        <p className="note">Your child shows up as <b>Signed in</b> once they&apos;ve logged in. Until then you&apos;ll see <b>Invite sent</b>, with buttons to resend or cancel. Ask them to check spam if the email doesn&apos;t arrive.</p>
      </section>

      <section id="quiz">
        <h2><span className="step">2</span>Make a quiz from a study guide</h2>
        <ol>
          <li>On the Parent tab, tap <Link href="/parent/new">New quiz from study guide</Link>.</li>
          <li>Snap photos of every page of the guide, or upload the PDF. Add a note if you want to steer it, like &ldquo;only sections 3 and 4&rdquo;.</li>
          <li>Tap <b>Write 20 questions</b> and give it a minute or two.</li>
          <li>Read through the questions. You can reword any of them, tap a different circle to change the right answer, or remove ones you don&apos;t like.</li>
          <li>Under <b>Assign to</b>, pick which child gets it, then tap <b>Publish quiz</b>.</li>
        </ol>
        <p className="note">Quiz Desk also saves an outline of the study guide with the quiz (at the bottom of the review screen). That&apos;s what lets it write fresh rounds later without the pages.</p>
      </section>

      <section id="spelling">
        <h2><span className="step">3</span>Make a spelling list</h2>
        <ol>
          <li>Tap <Link href="/parent/spelling/new">New spelling list</Link>.</li>
          <li>Type or paste the words, one per line, or snap a photo of the list from school.</li>
          <li>Tap <b>Prepare words</b>. Each word gets a short sentence and meaning, and its tricky letters are marked.</li>
          <li>Check the spellings. Tap letters to change which ones are hidden in Missing Letters (dark letters are hidden).</li>
          <li>Assign it and tap <b>Save spelling list</b>.</li>
        </ol>
        <p className="note">Each list becomes two games: <b>Word Builder</b> (hear the word, tap the letter tiles in order) and <b>Missing Letters</b> (fill in the tricky letters).</p>
      </section>

      <section id="kids">
        <h2><span className="step">4</span>What your kids see</h2>
        <ul>
          <li>Only what you&apos;ve assigned to them, on their home screen.</li>
          <li><b>Quizzes</b> show one question at a time. They can skip and come back, or tap <b>Save &amp; exit</b> and resume later. After they submit, they see their score and an explanation for every question.</li>
          <li><b>Spelling games</b> read each word aloud, so they need their sound on. Any word they slip on comes back once at the end.</li>
        </ul>
        <p className="note">On a phone or iPad, have them open the site in Safari and choose <b>Share → Add to Home Screen</b>. It opens like an app and keeps them signed in.</p>
      </section>

      <section id="progress">
        <h2><span className="step">5</span>Check how it&apos;s going</h2>
        <p>The <Link href="/parent">Parent</Link> tab shows the last 30 days at the top and every attempt below it. Tap a date for a question-by-question breakdown with a time chart.</p>
        <dl className="terms">
          <div><dt>Focused time</dt><dd>Time actually on the quiz. It leaves out time spent in other apps or tabs, and any stretch longer than {idle} seconds with no taps or typing.</dd></div>
          <div><dt>Rushed</dt><dd>An answer given in under {rush} seconds, which usually means guessing.</dd></div>
          <div><dt>Left page</dt><dd>How many times they switched away from the quiz, and for how long.</dd></div>
        </dl>
        <p>Each attempt gets an effort label:</p>
        <div className="effort">
          <div><span className="pill good">Focused</span><span>Steady pace, little time away.</span></div>
          <div><span className="pill warn">Mixed</span><span>Some rushing or some time away.</span></div>
          <div><span className="pill bad">Rushed</span><span>About a third or more of the answers came in under {rush} seconds.</span></div>
          <div><span className="pill bad">Distracted</span><span>A quarter or more of the time was spent away or idle.</span></div>
        </div>
        <p>For spelling, open <b>Progress</b> on a list to see every word as <b>Not tried</b>, <b>Practicing</b> or <b>Mastered</b> (spelled right on the first try the last two times), plus how they actually misspelled it.</p>
      </section>

      <section id="round">
        <h2><span className="step">6</span>Make the next round</h2>
        <ol>
          <li>Under <b>Quizzes</b> on the Parent tab, tap <b>Next round</b>, or tap <b>Make the next round</b> from an attempt&apos;s breakdown.</li>
          <li>You&apos;ll see the topics your child missed most. Use the slider to choose how many of the 20 new questions go back over them (about half by default).</li>
          <li>Tap <b>Write 20 new questions</b>, review, and publish. No photos needed, and no question from earlier rounds is repeated.</li>
        </ol>
        <p className="note">A good rhythm: first quiz early in the week, next round a day or two later, one more the night before the test.</p>
      </section>

      <section id="limit">
        <h2><span className="step">7</span>Your monthly limit</h2>
        <p>New quizzes, next rounds and spelling lists each count as one toward your family&apos;s monthly limit. The Parent tab shows how many you have left, and the count resets on the 1st. Taking quizzes and playing the spelling games never counts.</p>
      </section>

      <section id="help">
        <h2><span className="step">8</span>If something&apos;s off</h2>
        <dl className="terms">
          <div><dt>Your child isn&apos;t in the Assign list</dt><dd>They haven&apos;t signed in yet. Once they do, they appear there. Until then, choose <b>Every student</b>.</dd></div>
          <div><dt>&ldquo;Your account isn&apos;t set up yet&rdquo;</dt><dd>They signed in with a different email than the one invited, often by tapping &ldquo;Continue with Google.&rdquo; Sign out and use the invited address, or invite the address they used.</dd></div>
          <div><dt>No sound in the spelling games</dt><dd>Turn the volume up. On an iPhone, also check the silent switch on the side.</dd></div>
          <div><dt>You want to try a quiz yourself</dt><dd>Tap <b>Preview</b>. Anything you take as a parent is a preview and is never recorded.</dd></div>
          <div><dt>A quiz question is wrong after publishing</dt><dd>Tap <b>Hide</b> on it, then make a new round or a new quiz with the fix.</dd></div>
        </dl>
      </section>

      <footer className="row">
        <Link className="btn primary" href="/parent/new">Make your first quiz</Link>
        <Link className="btn" href="/parent">Go to the Parent tab</Link>
      </footer>
    </article>
  );
}
