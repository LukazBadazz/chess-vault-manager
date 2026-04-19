
declare module 'pgn-parser' {
    export function parse(pgn: string): {
        headers: { name: string; value: string }[];
        moves: any[];
        result: string;
    }[];
}
