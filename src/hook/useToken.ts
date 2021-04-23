import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Contract as MulticallContract } from "ethers-multicall"
import { constants } from "ethers"
import { Big } from "big.js"
import { Contract } from "container/contract"
import { BIG_ZERO } from "../constant/number"
import { Connection } from "../container/connection"
import { Transaction, TransactionAction } from "../container/transaction"
import { big2BigNum, bigNum2Big } from "../util/format"
import { useContractCall } from "./useContractCall"

export function useToken(address: string, decimals: number) {
    const { multicallProvider, account, signer } = Connection.useContainer()
    const { erc20 } = Contract.useContainer()
    const { executeWithGasLimit } = Transaction.useContainer()
    const [balance, setBalance] = useState(BIG_ZERO)
    const [allowance, setAllowance] = useState<Record<string, Big>>({})
    const [totalSupply, setTotalSupply] = useState(BIG_ZERO)

    const contract = useMemo(() => {
        return erc20?.attach(address) || null
    }, [erc20, address])

    useEffect(() => {
        async function fetchToken() {
            if (erc20 && multicallProvider && address) {
                const contract = new MulticallContract(address, erc20.interface.fragments)
                const [totalSupply] = await multicallProvider.all([contract.totalSupply()])
                setTotalSupply(bigNum2Big(totalSupply, decimals))
            }
        }
        fetchToken()
    }, [erc20, multicallProvider, address, decimals])

    useEffect(() => {
        async function fetchBalance() {
            if (erc20 && multicallProvider && address && account) {
                const contract = new MulticallContract(address, erc20.interface.fragments)
                const [balance] = await multicallProvider.all([contract.balanceOf(account)])
                setBalance(bigNum2Big(balance, decimals))
            }
        }
        fetchBalance()
    }, [erc20, multicallProvider, address, account, decimals])

    const queryAllowanceBySpender = useCallback(
        async (spender: string) => {
            if (spender && contract && account) {
                const _allowance = await contract.allowance(account, spender)
                setAllowance(prev => ({
                    ...prev,
                    [spender]: bigNum2Big(_allowance, decimals),
                }))
            }
        },
        [contract, account, decimals],
    )

    const approve = useContractCall(
        async (contractAddress: string, amount: Big) => {
            const receipt = await executeWithGasLimit(
                contract!.connect(signer),
                "approve",
                [contractAddress, big2BigNum(amount)],
                {
                    action: TransactionAction.APPROVE,
                    successMsg: {
                        description: "",
                    },
                },
            )
            return receipt
        },
        [executeWithGasLimit, signer, contract],
    )

    const approveInfinity = useContractCall(
        async (contractAddress: string) => {
            const receipt = await executeWithGasLimit(
                contract!.connect(signer),
                "approve",
                [contractAddress, constants.MaxUint256],
                {
                    action: TransactionAction.APPROVE,
                    successMsg: {
                        description: "",
                    },
                },
            )
            return receipt
        },
        [executeWithGasLimit, signer, contract],
    )

    useContractEvent(contract, "Transfer", async (from: string, to: string) => {
        if (contract && (from === account || to === account)) {
            const balance = await contract.balanceOf(account)
            setBalance(bigNum2Big(balance, decimals))
        }
    })

    useContractEvent(contract, "Approval", async (owner: string, spender: string) => {
        if (contract && owner === account) {
            const allowance = await contract.allowance(owner, spender)
            setAllowance(prev => ({
                ...prev,
                [spender]: bigNum2Big(allowance, decimals),
            }))
        }
    })

    return {
        contract,
        decimals,
        totalSupply,
        balance,
        allowance,
        queryAllowanceBySpender,
        approve,
        approveInfinity,
    }
}

type Callback = (...args: any[]) => void

export function useContractEvent(contract: any, eventName: string, callback: Callback) {
    const savedCallback = useRef<Callback | null>()

    // Remember the latest callback.
    useEffect(() => {
        savedCallback.current = callback
    })

    useEffect(() => {
        function listener(...args: any[]) {
            if (savedCallback.current) {
                savedCallback.current(...args)
            }
        }
        if (contract && eventName) {
            contract.on(eventName, listener)

            return () => {
                contract.off(eventName, listener)
            }
        }
    }, [contract, eventName])
}