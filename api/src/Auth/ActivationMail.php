<?php

declare(strict_types=1);

namespace Humanome\Auth;

use Humanome\Env;
use Humanome\Llm\FreeCreditLedger;
use Humanome\Mail\MailerFactory;
use PDO;

/**
 * The sign-up mails (D5 / AD-D3; sprint 7, S7a-2), shared by POST
 * /api/auth/register and /resend, the lift of the waiting list (Waitlist:
 * the month's first request, the tick, the administrator).
 *
 * The activation code: 4 digits, hashed in the base (Argon2id), 30 minutes,
 * 5 attempts. Sent again, it is regenerated and its attempts reopened
 * (Users::setVerificationCode). The waiting-list mail carries no code: the
 * activation by code is deferred to the lift.
 */
final class ActivationMail
{
    /** The code's life (30 minutes). */
    public const CODE_TTL_SECONDS = 1800;

    /**
     * Generates a code, stores its hash and expiry, and sends it by mail.
     * $afterWaitlist: the account leaves the waiting list — the mail says so,
     * and how to get a fresh code once this one has expired (the lift may run
     * at night, at 00:00 UTC).
     */
    public static function send(PDO $pdo, int $userId, string $email, bool $afterWaitlist = false): void
    {
        $code = str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        $expiresAt = date('Y-m-d H:i:s', time() + self::CODE_TTL_SECONDS);
        Users::setVerificationCode($pdo, $userId, Users::hashPassword($code), $expiresAt);

        $site = self::site();
        $link = $site . '/#/activer?email=' . rawurlencode($email) . '&code=' . $code;
        $intro = $afterWaitlist
            ? [
                'Bonjour,',
                '',
                'Votre inscription sur humanome.xyz sort de la liste d\'attente.',
                'Pour activer votre compte, votre code de confirmation est :',
            ]
            : [
                'Bonjour,',
                '',
                'Bienvenue sur humanome.xyz. Pour activer votre compte, votre code de confirmation est :',
            ];
        $expiry = $afterWaitlist
            ? [
                'Ce code expire dans 30 minutes. Passé ce délai, connectez-vous sur ' . $site . '/#/compte avec votre',
                'adresse et votre mot de passe, puis demandez « Renvoyer le code ».',
                'Si vous n\'êtes pas à l\'origine de cette inscription, ignorez ce message.',
            ]
            : ['Ce code expire dans 30 minutes. Si vous n\'êtes pas à l\'origine de cette inscription, ignorez ce message.'];
        $body = implode("\n", [
            ...$intro,
            '',
            '    ' . $code,
            '',
            'Vous pouvez aussi cliquer ce lien — il vous connecte sans ressaisir votre mot de passe :',
            $link,
            '',
            ...$expiry,
            '',
            '— L\'équipe humanome.xyz',
        ]);
        MailerFactory::default()->send($email, 'humanome.xyz — activez votre compte', $body);
    }

    /**
     * The mail of a sign-up put on the waiting list: no code, the date of the
     * lift. The browser shows the same words (Waitlist::signupMessage).
     */
    public static function sendWaitlisted(string $email, ?int $now = null): void
    {
        $body = implode("\n", [
            'Bonjour,',
            '',
            'Merci de votre inscription sur humanome.xyz.',
            'Les crédits offerts de ce mois sont épuisés : votre inscription est en liste d\'attente.',
            'Le ' . FreeCreditLedger::nextMonthLabel($now) . ', vous recevrez par email votre code d\'activation'
                . ' (plus tôt si l\'administrateur lève la liste).',
            'D\'ici là, votre compte ne peut pas se connecter.',
            '',
            'Si vous n\'êtes pas à l\'origine de cette inscription, ignorez ce message.',
            '',
            '— L\'équipe humanome.xyz',
        ]);
        MailerFactory::default()->send($email, 'humanome.xyz — votre inscription est en liste d\'attente', $body);
    }

    private static function site(): string
    {
        return rtrim(Env::get('SITE_URL', 'https://humanome.xyz'), '/');
    }
}
